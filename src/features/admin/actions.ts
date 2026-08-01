'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { EmailAddress } from '@/core/domain/value-objects/email-address';
import { makeAssignProfileUseCase, makeRevokeAssignmentUseCase } from '@/infrastructure/container';
import { getCredentialCipher } from '@/infrastructure/crypto/credential-cipher';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { requireAdmin } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
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
  const profiles = Array.from({ length: parsed.data.maxProfiles }, (_, index) => ({
    account_id: account.id,
    label: `Perfil ${index + 1}`,
    slot_index: index + 1,
  }));

  const { error: profilesError } = await supabase.from('account_profiles').insert(profiles);

  if (profilesError) {
    logger.error('Cuenta creada pero fallaron los perfiles', {
      accountId: account.id,
      error: profilesError.message,
    });
    return { error: 'La cuenta se creó, pero no se pudieron generar sus perfiles' };
  }

  revalidatePath('/admin');
  return { success: `Cuenta "${parsed.data.label}" creada con ${parsed.data.maxProfiles} perfiles` };
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
    logger.error('Fallo al eliminar la cuenta', { accountId, error: error.message });
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
    price_amount: parsed.data.priceAmount,
    tagline: parsed.data.tagline,
    sender_domains: parsed.data.senderDomains,
    is_active: true,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: `Ya existe una plataforma con el identificador «${parsed.data.slug}»` };
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
