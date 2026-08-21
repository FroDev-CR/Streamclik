'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { EmailAddress } from '@/core/domain/value-objects/email-address';
import { isPlatformIconKey } from '@/features/catalog/platform-icons';
import {
  makeAssignProfileUseCase,
  makeGoPlayClient,
  makeRevokeAssignmentUseCase,
} from '@/infrastructure/container';
import { getCredentialCipher } from '@/infrastructure/crypto/credential-cipher';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { requireAdmin } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { mapGoPlayProfiles } from '@/infrastructure/providers/goplay/goplay.profiles';
import { logger } from '@/lib/logger';

/**
 * Server Actions de administración.
 *
 * Todas empiezan con `requireAdmin()`. Una Server Action es un endpoint POST
 * público: que sólo se invoque desde un componente protegido no la protege, y
 * cualquiera con una sesión válida puede llamarla directamente.
 *
 * Esa comprobación es además la segunda barrera, no la única: las políticas RLS
 * de `streaming_accounts` y `profile_assignments` exigen `is_admin()`, así que
 * un olvido aquí seguiría siendo rechazado por Postgres.
 */

const createAccountSchema = z.object({
  serviceId: z.string().uuid('Selecciona un servicio válido'),
  label: z.string().trim().min(2, 'Introduce un nombre para la cuenta').max(80),
  inboxEmail: z.string().trim().toLowerCase().email('Correo de ingesta inválido'),
  loginEmail: z.string().trim().toLowerCase().email('Correo de acceso inválido'),
  loginPassword: z.string().min(1, 'La contraseña es obligatoria'),
  maxProfiles: z.coerce.number().int().min(1).max(10),
});

const updateAccountSchema = z.object({
  accountId: z.string().uuid('Cuenta no válida'),
  serviceId: z.string().uuid('Selecciona un servicio válido'),
  label: z.string().trim().min(2, 'Introduce un nombre para la cuenta').max(80),
  inboxEmail: z.string().trim().toLowerCase().email('Correo de ingesta inválido'),
  loginEmail: z.string().trim().toLowerCase().email('Correo de acceso inválido'),
  // Vacía significa «conservar la actual»; nunca se devuelve el texto cifrado al formulario.
  loginPassword: z.string().max(500, 'La contraseña es demasiado larga').optional(),
  status: z.enum(['active', 'suspended', 'expired']),
});

const assignProfileSchema = z.object({
  accountProfileId: z.string().uuid(),
  userId: z.string().uuid(),
  // Coerción desde el `<input type="date">`, que llega siempre como string.
  expiresAt: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(value) : null)),
});

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

// -----------------------------------------------------------------------------

export async function createAccountAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = createAccountSchema.safeParse({
    serviceId: formData.get('serviceId'),
    label: formData.get('label'),
    inboxEmail: formData.get('inboxEmail'),
    loginEmail: formData.get('loginEmail'),
    loginPassword: formData.get('loginPassword'),
    maxProfiles: formData.get('maxProfiles'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  // La dirección de ingesta se normaliza con la MISMA función que usa el
  // webhook al buscarla. Si aquí se guardara `Netflix1@…` y allí se buscara
  // `netflix1@…`, los códigos de esa cuenta se perderían en silencio.
  const inboxEmail = EmailAddress.normalizeForRouting(parsed.data.inboxEmail);

  const supabase = await createSupabaseServerClient();

  const { data: account, error } = await supabase
    .from('streaming_accounts')
    .insert({
      service_id: parsed.data.serviceId,
      owner_id: admin.id,
      label: parsed.data.label,
      inbox_email: inboxEmail,
      login_email: parsed.data.loginEmail,
      // Cifrado antes de tocar la base de datos. Ver docs/adr/0007 para el
      // alcance real de esta protección.
      login_password_enc: getCredentialCipher().encrypt(parsed.data.loginPassword),
      max_profiles: parsed.data.maxProfiles,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya existe una cuenta con ese correo de ingesta' };
    }
    logger.error('Fallo al crear la cuenta', { error: error.message });
    return { error: 'No se pudo crear la cuenta' };
  }

  // Se crean los slots de perfil por adelantado. Son el inventario vendible: sin
  // ellos, el administrador tendría que crearlos uno a uno antes de poder asignar
  // nada, y ese paso extra se olvida.
  //
  // El nombre y el PIN de cada perfil llegan del formulario cuando el operador
  // los sabe ya —que es lo habitual: los acaba de leer en la plataforma— y caen
  // a «Perfil N» sin PIN cuando no. Ambos se pueden corregir después desde el
  // banco, así que no bloquean el alta.
  const profiles = Array.from({ length: parsed.data.maxProfiles }, (_, index) => {
    const label = String(formData.get(`profileLabel:${index}`) ?? '').trim();
    const pin = String(formData.get(`profilePin:${index}`) ?? '').trim();

    return {
      account_id: account.id,
      label: label.slice(0, 60) || `Perfil ${index + 1}`,
      // Sólo se acepta el formato exacto; cualquier otra cosa se guarda como
      // «sin PIN» en lugar de escribir basura que el cliente intentaría teclear.
      profile_pin: /^[0-9]{4}$/.test(pin) ? pin : null,
      slot_index: index + 1,
    };
  });

  const { error: profilesError } = await supabase.from('account_profiles').insert(profiles);

  if (profilesError) {
    logger.error('Cuenta creada pero fallaron los perfiles', {
      accountId: account.id,
      error: profilesError.message,
    });
    return {
      error: 'La cuenta se creó, pero no se pudieron generar sus perfiles',
    };
  }

  revalidatePath('/admin');
  return {
    success: `Cuenta "${parsed.data.label}" creada con ${parsed.data.maxProfiles} perfiles`,
  };
}

// -----------------------------------------------------------------------------

/** Modifica las credenciales y metadatos de una cuenta sin tocar sus perfiles. */
export async function updateAccountAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = updateAccountSchema.safeParse({
    accountId: formData.get('accountId'),
    serviceId: formData.get('serviceId'),
    label: formData.get('label'),
    inboxEmail: formData.get('inboxEmail'),
    loginEmail: formData.get('loginEmail'),
    loginPassword: String(formData.get('loginPassword') ?? '') || undefined,
    status: formData.get('status'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const inboxEmail = EmailAddress.normalizeForRouting(parsed.data.inboxEmail);
  const supabase = await createSupabaseServerClient();

  const { data: anterior, error: readError } = await supabase
    .from('streaming_accounts')
    .select('service_id, label, inbox_email, login_email, status')
    .eq('id', parsed.data.accountId)
    .maybeSingle();

  if (readError || !anterior) {
    logger.error('No se pudo leer la cuenta antes de modificarla', {
      accountId: parsed.data.accountId,
      error: readError?.message,
    });
    return { error: 'La cuenta ya no existe o no se pudo leer' };
  }

  const cambios = {
    service_id: parsed.data.serviceId,
    label: parsed.data.label,
    inbox_email: inboxEmail,
    login_email: parsed.data.loginEmail,
    status: parsed.data.status,
    ...(parsed.data.loginPassword
      ? { login_password_enc: getCredentialCipher().encrypt(parsed.data.loginPassword) }
      : {}),
  };

  const { error } = await supabase
    .from('streaming_accounts')
    .update(cambios)
    .eq('id', parsed.data.accountId);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya existe otra cuenta con ese correo de ingesta' };
    }
    logger.error('Fallo al modificar la cuenta', {
      accountId: parsed.data.accountId,
      error: error.message,
    });
    return { error: 'No se pudo guardar la cuenta' };
  }

  // El registro de auditoría no incluye la contraseña ni su valor cifrado.
  await supabase.from('audit_logs').insert({
    actor_id: admin.id,
    action: 'account.updated',
    entity_type: 'streaming_account',
    entity_id: parsed.data.accountId,
    metadata: {
      previous: anterior,
      password_changed: Boolean(parsed.data.loginPassword),
    },
  });

  revalidatePath('/admin');
  revalidatePath('/dashboard');
  revalidatePath('/catalogo');

  return { success: `Cuenta "${parsed.data.label}" actualizada` };
}

// -----------------------------------------------------------------------------

export async function assignProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = assignProfileSchema.safeParse({
    accountProfileId: formData.get('accountProfileId'),
    userId: formData.get('userId'),
    expiresAt: formData.get('expiresAt') || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const useCase = await makeAssignProfileUseCase();
  const result = await useCase.execute({
    accountProfileId: parsed.data.accountProfileId,
    userId: parsed.data.userId,
    assignedBy: admin.id,
    expiresAt: parsed.data.expiresAt,
  });

  if (!result.ok) {
    // Los errores de negocio (perfil ya asignado, cuenta llena) llevan un mensaje
    // pensado para el administrador; los de infraestructura se ocultan tras un
    // texto genérico para no filtrar detalles internos.
    const message =
      result.error.code === 'INFRASTRUCTURE_ERROR'
        ? 'No se pudo completar la asignación'
        : result.error.message;
    return { error: message };
  }

  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return { success: 'Perfil asignado correctamente' };
}

// -----------------------------------------------------------------------------

const updateProfileSchema = z.object({
  profileId: z.string().uuid('Perfil no válido'),
  label: z.string().trim().min(1, 'El perfil necesita un nombre').max(60, 'Máximo 60 caracteres'),
  // Vacío significa «sin PIN», que es un estado legítimo: un perfil recién
  // creado no tiene ninguno y el operador debe poder quitarlo igual que ponerlo.
  profilePin: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[0-9]{4}$/.test(value), 'El PIN debe tener 4 dígitos')
    .transform((value) => (value === '' ? null : value)),
});

/**
 * Cambiar el nombre y el PIN de un perfil.
 *
 * Los dos datos van juntos porque es el mismo gesto: el operador entra a la
 * plataforma, ve «Perfil 2 · 4821» y lo deja escrito aquí para que el cliente lo
 * encuentre en su panel. Separarlos en dos formularios obligaría a guardar dos
 * veces lo que se mira una sola vez.
 *
 * El PIN se guarda en claro a propósito, igual que ya estaba en el esquema: el
 * cliente necesita el valor original para teclearlo en el televisor, así que no
 * puede hashearse. No es una credencial de acceso a la cuenta —esa sí se cifra—,
 * sino el código de un perfil dentro de una cuenta que el cliente ya tiene.
 */
export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = updateProfileSchema.safeParse({
    profileId: formData.get('profileId'),
    label: formData.get('label'),
    profilePin: String(formData.get('profilePin') ?? ''),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('account_profiles')
    .update({ label: parsed.data.label, profile_pin: parsed.data.profilePin })
    .eq('id', parsed.data.profileId);

  if (error) {
    logger.error('No se pudo actualizar el perfil', {
      profileId: parsed.data.profileId,
      error: error.message,
    });
    return { error: 'No se pudo guardar el perfil' };
  }

  revalidatePath('/admin');
  // El cliente ve el nombre y el PIN en su panel y en el detalle de la cuenta:
  // sin revalidarlos seguiría leyendo el valor viejo hasta su siguiente visita.
  revalidatePath('/dashboard');
  revalidatePath('/cuenta', 'layout');

  return { success: `«${parsed.data.label}» actualizado` };
}

// -----------------------------------------------------------------------------

export async function revokeAssignmentAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const assignmentId = String(formData.get('assignmentId') ?? '');
  if (!assignmentId) return;

  const useCase = await makeRevokeAssignmentUseCase();
  await useCase.execute(assignmentId);

  // La revocación surte efecto inmediato en el acceso: `has_account_access()`
  // exige `status = 'active'`, así que el cliente deja de ver los PIN en la
  // siguiente consulta y también en sus suscripciones de Realtime.
  revalidatePath('/admin');
  revalidatePath('/dashboard');
}

// -----------------------------------------------------------------------------

/**
 * Eliminar una cuenta del banco.
 *
 * Es **irreversible** y arrastra por clave foránea en cascada:
 *
 *   · `account_profiles`     → se borran los perfiles
 *   · `profile_assignments`  → se borran las asignaciones (y con ellas el acceso)
 *   · `verification_pins`    → se borra el historial de códigos
 *
 * `inbound_emails` se conserva con `account_id` a null: son el registro de qué
 * llegó al buzón y sirven para diagnosticar aunque la cuenta ya no exista.
 *
 * No se comprueba aquí si hay asignaciones activas. La decisión de cortarle el
 * acceso a un cliente es del operador, no de esta función; lo que sí hace la
 * interfaz es decirle exactamente a cuántos afecta antes de confirmar.
 */
export async function deleteAccountAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const accountId = String(formData.get('accountId') ?? '');

  if (!z.string().uuid().safeParse(accountId).success) {
    return { error: 'Cuenta no válida' };
  }

  const supabase = await createSupabaseServerClient();

  // Se lee la etiqueta antes de borrar para poder nombrarla en el mensaje de
  // confirmación: después ya no existe.
  const { data: cuenta } = await supabase
    .from('streaming_accounts')
    .select('label')
    .eq('id', accountId)
    .maybeSingle();

  const { error } = await supabase.from('streaming_accounts').delete().eq('id', accountId);

  if (error) {
    logger.error('Fallo al eliminar la cuenta', {
      accountId,
      error: error.message,
    });
    return { error: 'No se pudo eliminar la cuenta' };
  }

  // Queda registrado quién borró qué: es una acción destructiva y sin rastro
  // sería imposible explicar después por qué un cliente perdió el acceso.
  await supabase.from('audit_logs').insert({
    actor_id: admin.id,
    action: 'account.deleted',
    entity_type: 'streaming_account',
    entity_id: accountId,
    metadata: { label: cuenta?.label ?? null },
  });

  logger.info('Cuenta eliminada', { accountId, actor: admin.id });

  revalidatePath('/admin');
  revalidatePath('/dashboard');

  return { success: `Cuenta "${cuenta?.label ?? accountId}" eliminada` };
}

// -----------------------------------------------------------------------------

/**
 * Borrar un cliente.
 *
 * Borra **siempre**, tenga historial o no. Es una decisión explícita del
 * operador: antes se bloqueaba cuando había pedidos, y resultó que el caso real
 * —limpiar cuentas de prueba que ya habían hecho compras de prueba— quedaba
 * fuera.
 *
 * Lo que se lleva por delante no es poco, y por eso la interfaz lo enumera antes
 * de pedir confirmación: las claves foráneas de `orders` y `profile_assignments`
 * son `on delete cascade`, así que desaparecen sus compras y el registro de qué
 * perfiles tuvo. Los perfiles en sí **no** se borran: `account_profiles` cuelga
 * de la cuenta, no del cliente, así que el inventario queda libre y reutilizable.
 *
 * Antes de borrar se anota en auditoría **qué** se está borrando, con el recuento
 * de pedidos incluido. Es el único rastro que sobrevive, y sin él no habría forma
 * de explicar después por qué faltan ventas en un informe.
 *
 * El orden importa. Primero Clerk y después Supabase:
 *
 *   · Si se borrara Supabase primero y Clerk fallara, esa persona entraría de
 *     nuevo con su correo de siempre y `sync_current_user` le crearía un perfil
 *     limpio. El cliente "borrado" reaparecería en la lista sin que nadie
 *     entendiera por qué.
 *   · Al revés, si Clerk sale bien y Supabase falla, queda una fila sin
 *     identidad: nadie puede entrar con ella y el operador puede reintentar. Por
 *     eso el 404 de Clerk no se trata como error — en el segundo intento la
 *     identidad ya no existe y lo que falta es justamente borrar la fila.
 */
export async function deleteClientAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const clientId = String(formData.get('clientId') ?? '');
  if (!z.string().uuid().safeParse(clientId).success) {
    return { error: 'Cliente no válido' };
  }

  // Borrarse a uno mismo dejaría el panel sin operador y la sesión en un limbo.
  if (clientId === admin.id) {
    return { error: 'No puedes borrar tu propia cuenta desde aquí.' };
  }

  const supabase = await createSupabaseServerClient();

  const { data: cliente, error: readError } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, clerk_user_id')
    .eq('id', clientId)
    .maybeSingle();

  if (readError || !cliente) {
    return { error: 'Ese cliente ya no existe.' };
  }

  // La pantalla sólo lista clientes, pero nada impide llamar a esta acción con
  // el identificador de otro administrador.
  if (cliente.role !== 'client') {
    return { error: 'Sólo se pueden borrar cuentas de cliente.' };
  }

  // No condiciona el borrado: se guarda para dejarlo escrito en auditoría, que
  // es lo único que quedará cuando las filas ya no estén.
  const [{ count: pedidos }, { count: asignaciones }] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', clientId),
    supabase
      .from('profile_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', clientId),
  ]);

  // Un fallo en Clerk **no** aborta el borrado.
  //
  // La versión anterior sí lo hacía y era peor de lo que parecía: si la llamada
  // a Clerk fallaba, la acción devolvía «no se ha tocado nada» y el operador
  // pulsaba una y otra vez sin que el cliente desapareciera nunca. El objetivo
  // aquí es que la fila se vaya; que además se limpie la identidad es deseable,
  // pero no puede ser la condición para lo primero.
  let avisoClerk: string | null = null;

  if (cliente.clerk_user_id) {
    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(cliente.clerk_user_id);
    } catch (error) {
      // 404 = ya no estaba en Clerk. No es un fallo: es el reintento tras un
      // borrado a medias, o una cuenta creada en otra instancia.
      const status = (error as { status?: number })?.status;
      const mensaje = error instanceof Error ? error.message : String(error);

      if (status !== 404) {
        logger.error('No se pudo borrar la identidad en Clerk', {
          clientId,
          status,
          error: mensaje,
        });
        avisoClerk = mensaje;
      }
    }
  }

  // El borrado va con el cliente normal, con RLS aplicando (ADR-0003): la
  // política «administradores gestionan perfiles» ya lo autoriza. Durante un
  // rato se sospechó que RLS lo estaba bloqueando en silencio y se probó con el
  // cliente administrativo; era una pista falsa. Lo que fallaba de verdad era
  // una clave foránea, y saltarse RLS no habría arreglado nada — sólo habría
  // movido la frontera de autorización fuera de Postgres sin motivo.
  //
  // `.select()` sí se queda: devuelve las filas borradas, y sin eso no hay forma
  // de distinguir «borré una» de «no borré ninguna». Un DELETE que no afecta a
  // nada responde igual que uno que funciona.
  const { data: borradas, error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', clientId)
    .select('id');

  if (error) {
    logger.error('No se pudo borrar el perfil', {
      clientId,
      code: error.code,
      error: error.message,
    });

    // 23503 es una clave foránea que lo impide. Fue el fallo real durante toda
    // la depuración —`order_assignments` estaba en `on delete restrict`— y el
    // mensaje crudo de Postgres nombra la restricción exacta, que es lo único
    // que permitió encontrarlo. Se muestra tal cual por eso mismo.
    if (error.code === '23503') {
      return {
        error: `Hay datos que dependen de este cliente y lo impiden: ${error.message}`,
      };
    }

    return { error: `No se pudo borrar: ${error.message}` };
  }

  if (!borradas || borradas.length === 0) {
    logger.error('El borrado no afectó a ninguna fila', { clientId });
    return { error: 'La fila ya no existía o no se pudo borrar. Recarga la página.' };
  }

  // El registro sobrevive al borrado con `actor_id` intacto: quién limpió qué
  // cuenta es exactamente el dato que hará falta si alguien pregunta después.
  await supabase.from('audit_logs').insert({
    actor_id: admin.id,
    action: 'client.deleted',
    entity_type: 'user_profile',
    entity_id: clientId,
    metadata: {
      email: cliente.email,
      full_name: cliente.full_name,
      // Cuánto se llevó por delante. Es lo único que quedará si alguien pregunta
      // más adelante por qué faltan ventas en un informe.
      pedidos_borrados: pedidos ?? 0,
      asignaciones_borradas: asignaciones ?? 0,
    },
  });

  logger.info('Cliente borrado', { clientId, actor: admin.id });

  revalidatePath('/admin/clientes');

  const nombre = cliente.full_name ?? cliente.email;

  // Si Clerk falló, el perfil ya no está pero la identidad sigue viva: esa
  // persona podría volver a entrar y aparecer como cliente nuevo. Se dice, en
  // lugar de cantar un éxito a medias.
  if (avisoClerk) {
    return {
      success: `«${nombre}» eliminado del panel, pero su cuenta de acceso sigue activa en Clerk (${avisoClerk}). Si vuelve a entrar, reaparecerá.`,
    };
  }

  return { success: `«${nombre}» eliminado` };
}

// -----------------------------------------------------------------------------

const plataformaSchema = z.object({
  name: z.string().trim().min(2, 'Introduce el nombre de la plataforma').max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9-]+$/,
      'El identificador sólo admite minúsculas, números y guiones (ej. disney-plus)',
    )
    .max(40),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal, como #E50914'),
  iconKey: z
    .string()
    .refine(isPlatformIconKey, 'Selecciona un icono válido'),
  priceAmount: z.coerce.number().min(0, 'El precio no puede ser negativo').max(1_000_000),
  tagline: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v ? v : null)),
  senderDomains: z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((dominio) => dominio.trim().toLowerCase())
            .filter(Boolean)
        : [],
    ),
});

const updatePlatformSchema = plataformaSchema.omit({ slug: true }).extend({
  serviceId: z.string().uuid('Plataforma no válida'),
});

/**
 * Alta de una plataforma en el catálogo.
 *
 * Aparece en la portada en cuanto se crea, pero **no** extrae códigos todavía:
 * eso exige un parser propio en `src/infrastructure/email/parsers/`. Los correos
 * de una plataforma sin parser se guardan como «sin código», que es honesto —no
 * hay nada que extraer— pero conviene saberlo antes de venderla.
 *
 * `sender_domains` se guarda aunque el parser tipado no lo use todavía: es el
 * dato que hará falta para escribirlo y es el momento en que se tiene a mano.
 */
export async function createPlatformAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = plataformaSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    brandColor: formData.get('brandColor'),
    iconKey: formData.get('iconKey'),
    priceAmount: formData.get('priceAmount'),
    tagline: formData.get('tagline'),
    senderDomains: formData.get('senderDomains'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('streaming_services').insert({
    slug: parsed.data.slug,
    name: parsed.data.name,
    brand_color: parsed.data.brandColor,
    icon_key: parsed.data.iconKey,
    price_amount: parsed.data.priceAmount,
    tagline: parsed.data.tagline,
    sender_domains: parsed.data.senderDomains,
    is_active: true,
  });

  if (error) {
    if (error.code === '23505') {
      return {
        error: `Ya existe una plataforma con el identificador «${parsed.data.slug}»`,
      };
    }
    logger.error('Fallo al crear la plataforma', { error: error.message });
    return { error: 'No se pudo crear la plataforma' };
  }

  revalidatePath('/admin/plataformas');
  revalidatePath('/admin/nueva');
  // La portada la lee con revalidación por tiempo; se fuerza para que la
  // plataforma nueva aparezca en el catálogo sin esperar cinco minutos.
  revalidatePath('/');

  return { success: `«${parsed.data.name}» añadida al catálogo` };
}

/** Actualiza una plataforma sin cambiar su slug, que también identifica el parser de correo. */
export async function updatePlatformAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = updatePlatformSchema.safeParse({
    serviceId: formData.get('serviceId'),
    name: formData.get('name'),
    brandColor: formData.get('brandColor'),
    iconKey: formData.get('iconKey'),
    priceAmount: formData.get('priceAmount'),
    tagline: formData.get('tagline'),
    senderDomains: formData.get('senderDomains'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: anterior, error: readError } = await supabase
    .from('streaming_services')
    .select('slug, name, brand_color, icon_key, price_amount, tagline, sender_domains')
    .eq('id', parsed.data.serviceId)
    .maybeSingle();

  if (readError || !anterior) {
    logger.error('No se pudo leer la plataforma antes de modificarla', {
      serviceId: parsed.data.serviceId,
      error: readError?.message,
    });
    return { error: 'La plataforma ya no existe o no se pudo leer' };
  }

  const { error } = await supabase
    .from('streaming_services')
    .update({
      name: parsed.data.name,
      brand_color: parsed.data.brandColor,
      icon_key: parsed.data.iconKey,
      price_amount: parsed.data.priceAmount,
      tagline: parsed.data.tagline,
      sender_domains: parsed.data.senderDomains,
    })
    .eq('id', parsed.data.serviceId);

  if (error) {
    logger.error('Fallo al modificar la plataforma', {
      serviceId: parsed.data.serviceId,
      error: error.message,
    });
    return { error: 'No se pudieron guardar los cambios' };
  }

  await supabase.from('audit_logs').insert({
    actor_id: admin.id,
    action: 'platform.updated',
    entity_type: 'streaming_service',
    entity_id: parsed.data.serviceId,
    metadata: { previous: anterior },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/plataformas');
  revalidatePath('/admin/nueva');
  revalidatePath('/catalogo');
  revalidatePath('/');

  return { success: `«${parsed.data.name}» actualizada` };
}

/** Activa o desactiva una plataforma sin borrarla. */
export async function togglePlatformAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('serviceId') ?? '');
  const activar = String(formData.get('activar') ?? '') === 'true';

  if (!z.string().uuid().safeParse(id).success) return;

  const supabase = await createSupabaseServerClient();

  // Desactivar en lugar de borrar: una plataforma con cuentas asociadas no puede
  // eliminarse (`on delete restrict`), y aunque pudiera, se llevaría por delante
  // el histórico. Ocultarla del catálogo es lo que se quiere el 99 % de las veces.
  await supabase.from('streaming_services').update({ is_active: activar }).eq('id', id);

  revalidatePath('/admin/plataformas');
  revalidatePath('/');
}

const comboSchema = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre').max(80, 'Máximo 80 caracteres'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones'),
  priceAmount: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  tagline: z
    .string()
    .trim()
    .max(160, 'Máximo 160 caracteres')
    .optional()
    .transform((value) => value || null),
  serviceIds: z.array(z.string().uuid()).min(1, 'Elige al menos una aplicación'),
});

/** Crea un combo y sus aplicaciones como una única configuración de catálogo. */
export async function createComboAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = comboSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    priceAmount: formData.get('priceAmount'),
    tagline: formData.get('tagline'),
    serviceIds: formData.getAll('serviceIds'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const serviceIds = [...new Set(parsed.data.serviceIds)];
  const comboItems = serviceIds.map((serviceId) => ({
    serviceId,
    quantity: Number(formData.get(`serviceQuantity:${serviceId}`) ?? 1),
  }));

  if (comboItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) {
    return { fieldErrors: { serviceIds: 'Cada cantidad debe estar entre 1 y 10 perfiles' } };
  }

  if (comboItems.reduce((total, item) => total + item.quantity, 0) < 2) {
    return {
      fieldErrors: {
        serviceIds: 'Agrega al menos dos perfiles; pueden ser de la misma aplicación',
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: combo, error: comboError } = await supabase
    .from('streaming_combos')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      tagline: parsed.data.tagline,
      price_amount: parsed.data.priceAmount,
      price_currency: 'CRC',
      is_active: true,
    })
    .select('id')
    .single();

  if (comboError || !combo) {
    if (comboError?.code === '23505') {
      return {
        error: `Ya existe un combo con el identificador «${parsed.data.slug}»`,
      };
    }
    logger.error('No se pudo crear el combo', { error: comboError?.message });
    return { error: 'No se pudo crear el combo' };
  }

  const { error: itemsError } = await supabase.from('streaming_combo_items').insert(
    comboItems.map((item) => ({
      combo_id: combo.id,
      service_id: item.serviceId,
      quantity: item.quantity,
    })),
  );

  if (itemsError) {
    await supabase.from('streaming_combos').delete().eq('id', combo.id);
    logger.error('No se pudieron guardar las aplicaciones del combo', {
      error: itemsError.message,
    });
    return { error: 'No se pudieron guardar las aplicaciones del combo' };
  }

  revalidatePath('/admin/plataformas');
  revalidatePath('/catalogo');
  revalidatePath('/');

  return {
    success: `«${parsed.data.name}» ya aparece en la sección de combos`,
  };
}

const updateComboSchema = comboSchema.omit({ slug: true }).extend({
  comboId: z.string().uuid('Combo no válido'),
});

/**
 * Edita nombre, precio, frase y aplicaciones de un combo existente.
 *
 * El identificador (`slug`) no se toca: es la URL pública del combo y la clave
 * con la que se guardaron los pedidos ya hechos. Las aplicaciones se reemplazan
 * por completo — borrar e insertar es más simple y correcto que diferenciar, y
 * `streaming_combo_items` no tiene histórico que perder.
 */
export async function updateComboAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = updateComboSchema.safeParse({
    comboId: formData.get('comboId'),
    name: formData.get('name'),
    priceAmount: formData.get('priceAmount'),
    tagline: formData.get('tagline'),
    serviceIds: formData.getAll('serviceIds'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const serviceIds = [...new Set(parsed.data.serviceIds)];
  const comboItems = serviceIds.map((serviceId) => ({
    serviceId,
    quantity: Number(formData.get(`serviceQuantity:${serviceId}`) ?? 1),
  }));

  if (
    comboItems.some(
      (item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10,
    )
  ) {
    return {
      fieldErrors: {
        serviceIds: 'Cada cantidad debe estar entre 1 y 10 perfiles',
      },
    };
  }

  if (comboItems.reduce((total, item) => total + item.quantity, 0) < 2) {
    return {
      fieldErrors: {
        serviceIds: 'Agrega al menos dos perfiles; pueden ser de la misma aplicación',
      },
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: anterior } = await supabase
    .from('streaming_combos')
    .select('name, tagline, price_amount')
    .eq('id', parsed.data.comboId)
    .maybeSingle();

  const { error: comboError } = await supabase
    .from('streaming_combos')
    .update({
      name: parsed.data.name,
      tagline: parsed.data.tagline,
      price_amount: parsed.data.priceAmount,
    })
    .eq('id', parsed.data.comboId);

  if (comboError) {
    logger.error('No se pudo actualizar el combo', {
      error: comboError.message,
    });
    return { error: 'No se pudieron guardar los cambios del combo' };
  }

  // Reemplazo completo de las aplicaciones incluidas.
  const { error: borradoError } = await supabase
    .from('streaming_combo_items')
    .delete()
    .eq('combo_id', parsed.data.comboId);

  if (borradoError) {
    logger.error('No se pudieron limpiar las aplicaciones del combo', {
      error: borradoError.message,
    });
    return { error: 'No se pudieron guardar las aplicaciones del combo' };
  }

  const { error: itemsError } = await supabase.from('streaming_combo_items').insert(
    comboItems.map((item) => ({
      combo_id: parsed.data.comboId,
      service_id: item.serviceId,
      quantity: item.quantity,
    })),
  );

  if (itemsError) {
    logger.error('No se pudieron guardar las aplicaciones del combo', {
      error: itemsError.message,
    });
    return { error: 'No se pudieron guardar las aplicaciones del combo' };
  }

  await supabase.from('audit_logs').insert({
    actor_id: admin.id,
    action: 'combo.updated',
    entity_type: 'streaming_combo',
    entity_id: parsed.data.comboId,
    metadata: { previous: anterior },
  });

  revalidatePath('/admin/plataformas');
  revalidatePath('/catalogo');
  revalidatePath('/');

  return { success: `«${parsed.data.name}» actualizado` };
}

/**
 * Borra un combo definitivamente.
 *
 * Sólo es posible si ningún pedido lo referencia: `orders.combo_id` y
 * `order_items.combo_id` son `on delete restrict`, así que Postgres protege el
 * histórico de ventas. Cuando eso pasa se devuelve el motivo para que el
 * operador use «Ocultar del catálogo», que es lo que realmente quiere.
 */
export async function deleteComboAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const id = String(formData.get('comboId') ?? '');
  if (!z.string().uuid().safeParse(id).success) {
    return { error: 'Combo no válido' };
  }

  const supabase = await createSupabaseServerClient();

  const { data: combo } = await supabase
    .from('streaming_combos')
    .select('name, slug')
    .eq('id', id)
    .maybeSingle();

  // Los items caen solos por `on delete cascade`.
  const { error } = await supabase.from('streaming_combos').delete().eq('id', id);

  if (error) {
    if (error.code === '23503') {
      return {
        error:
          'Este combo ya tiene pedidos y no puede borrarse sin perder el histórico. Ocúltalo del catálogo.',
      };
    }
    logger.error('No se pudo borrar el combo', { error: error.message });
    return { error: 'No se pudo borrar el combo' };
  }

  await supabase.from('audit_logs').insert({
    actor_id: admin.id,
    action: 'combo.deleted',
    entity_type: 'streaming_combo',
    entity_id: id,
    metadata: { name: combo?.name ?? null, slug: combo?.slug ?? null },
  });

  revalidatePath('/admin/plataformas');
  revalidatePath('/catalogo');
  revalidatePath('/');

  return { success: `«${combo?.name ?? 'El combo'}» se eliminó del catálogo` };
}

/** Muestra u oculta un combo sin borrar sus pedidos históricos. */
export async function toggleComboAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('comboId') ?? '');
  const activar = String(formData.get('activar') ?? '') === 'true';
  if (!z.string().uuid().safeParse(id).success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from('streaming_combos').update({ is_active: activar }).eq('id', id);

  revalidatePath('/admin/plataformas');
  revalidatePath('/catalogo');
  revalidatePath('/');
}

// -----------------------------------------------------------------------------
// Importar del proveedor
// -----------------------------------------------------------------------------

const importarSchema = z.object({
  providerProfileId: z.string().trim().min(1, 'Falta el identificador del proveedor'),
  serviceId: z.string().uuid('Selecciona un servicio válido'),
  label: z.string().trim().min(2, 'Ponle un nombre a la cuenta').max(80),
  maxProfiles: z.coerce.number().int().min(1).max(10),
});

/**
 * Dar de alta una cuenta comprada en GoPlay.
 *
 * Del formulario sólo se aceptan cuatro cosas: cuál importar, a qué servicio de
 * nuestro catálogo pertenece, cómo llamarla y cuántos perfiles tiene. **El
 * correo y la contraseña se releen de GoPlay**, nunca del formulario. No es
 * ceremonia: una Server Action es un endpoint POST público, y aceptar
 * credenciales por ahí permitiría escribir en el banco unas que no son las que
 * el proveedor tiene.
 *
 * El correo de la cuenta se guarda a la vez como `login_email` y como
 * `inbox_email`. El segundo es el que importa: es la llave con la que el RPC de
 * ingesta resuelve la cuenta cuando llega el código.
 */
export async function importarDeGoPlayAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = importarSchema.safeParse({
    providerProfileId: formData.get('providerProfileId'),
    serviceId: formData.get('serviceId'),
    label: formData.get('label'),
    maxProfiles: formData.get('maxProfiles'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const inventario = await makeGoPlayClient().listProfiles();
  if (!inventario.ok) {
    return { error: `No se pudo leer el inventario de GoPlay: ${inventario.error.message}` };
  }

  const cuentas = mapGoPlayProfiles(inventario.value);
  if (!cuentas.ok) {
    return { error: cuentas.error.message };
  }

  const cuenta = cuentas.value.find((fila) => fila.id === parsed.data.providerProfileId);
  if (!cuenta) {
    return { error: 'Esa cuenta ya no aparece en tu inventario de GoPlay.' };
  }

  if (!cuenta.password) {
    return {
      error:
        'GoPlay no devolvió la contraseña de esa cuenta. Cópiala desde su panel y créala a mano.',
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: creada, error } = await supabase
    .from('streaming_accounts')
    .insert({
      service_id: parsed.data.serviceId,
      owner_id: admin.id,
      label: parsed.data.label,
      inbox_email: EmailAddress.normalizeForRouting(cuenta.correo),
      login_email: cuenta.correo,
      login_password_enc: getCredentialCipher().encrypt(cuenta.password),
      max_profiles: parsed.data.maxProfiles,
      code_provider: 'goplay',
      provider_profile_id: cuenta.id,
    })
    .select('id')
    .single();

  if (error) {
    // El índice único sobre inbox_email es lo que impide importar dos veces la
    // misma cuenta, y es mejor barrera que comprobarlo antes: dos pulsaciones
    // simultáneas pasarían las dos un SELECT previo.
    if (error.code === '23505') {
      return { error: 'Esa cuenta ya está en el banco.' };
    }
    logger.error('Fallo al importar una cuenta de GoPlay', {
      providerProfileId: cuenta.id,
      error: error.message,
    });
    return { error: 'No se pudo crear la cuenta' };
  }

  // El PIN que devuelve GoPlay es el del perfil que ellos numeran; se aplica al
  // primer slot y los demás quedan sin PIN, como en el alta manual.
  const perfiles = Array.from({ length: parsed.data.maxProfiles }, (_, index) => ({
    account_id: creada.id,
    label: `Perfil ${index + 1}`,
    profile_pin: index === 0 && cuenta.pin && /^[0-9]{4}$/.test(cuenta.pin) ? cuenta.pin : null,
    slot_index: index + 1,
  }));

  const { error: errorPerfiles } = await supabase.from('account_profiles').insert(perfiles);

  if (errorPerfiles) {
    logger.error('Cuenta importada pero fallaron los perfiles', {
      accountId: creada.id,
      error: errorPerfiles.message,
    });
    return { error: 'La cuenta se importó, pero no se pudieron generar sus perfiles' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/goplay');

  return {
    success: `"${parsed.data.label}" importada con ${parsed.data.maxProfiles} perfiles. Sus códigos ya se pueden pedir desde la app.`,
  };
}
