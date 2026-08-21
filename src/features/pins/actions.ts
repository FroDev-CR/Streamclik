'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { createSupabaseAdminClient } from '@/infrastructure/supabase/admin';
import { makeRequestGoPlayCodeUseCase } from '@/infrastructure/container';
import { rateLimit } from '@/lib/rate-limit';
import { requireAdmin, requireUser } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { toFieldErrors } from '@/features/shared/action-state';
import { logger } from '@/lib/logger';

/**
 * Server Actions de la cola de cambios de PIN.
 *
 * El cliente pide, el operador aplica (ver
 * `supabase/migrations/20260807001800_solicitudes_cambio_pin.sql`). Las de
 * cliente empiezan por `requireUser()` y las de operador por `requireAdmin()`,
 * pero esa comprobación es la segunda barrera, no la única: la política de
 * inserción exige además que el perfil esté asignado y vigente para quien pide,
 * así que un `account_profile_id` ajeno lo rechaza Postgres, no esta función.
 */

// -----------------------------------------------------------------------------
// Cliente
// -----------------------------------------------------------------------------

const solicitudSchema = z.object({
  accountId: z.string().uuid('Cuenta no válida'),
  accountProfileId: z.string().uuid('Perfil no válido'),
  requestedPin: z
    .string()
    .trim()
    .regex(/^[0-9]{4}$/, 'El PIN debe tener 4 dígitos'),
  note: z
    .string()
    .trim()
    .max(280, 'La nota no puede superar los 280 caracteres')
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * Pedir un cambio de PIN para el perfil propio.
 *
 * No hace falta comprobar aquí que el perfil pertenece a quien pide ni que su
 * asignación sigue vigente: la política de inserción de `pin_change_requests` ya
 * lo exige en Postgres, y el índice único parcial impide una segunda solicitud
 * mientras la primera siga pendiente.
 */
export async function solicitarCambioPinAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = solicitudSchema.safeParse({
    accountId: formData.get('accountId'),
    accountProfileId: formData.get('accountProfileId'),
    requestedPin: formData.get('requestedPin'),
    note: formData.get('note'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('pin_change_requests').insert({
    account_profile_id: parsed.data.accountProfileId,
    requested_by: user.id,
    requested_pin: parsed.data.requestedPin,
    note: parsed.data.note,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya tienes una solicitud pendiente para este perfil.' };
    }
    // La política de inserción exige que el perfil esté asignado y vigente
    // para quien pide; Postgres lo devuelve como violación de RLS (42501), no
    // como un error de validación de campos.
    if (error.code === '42501') {
      return { error: 'Ese perfil ya no está asignado a tu cuenta.' };
    }
    logger.error('No se pudo registrar la solicitud de cambio de PIN', {
      error: error.message,
      code: error.code,
    });
    return { error: 'No se pudo enviar la solicitud. Inténtalo de nuevo.' };
  }

  revalidatePath(`/cuenta/${parsed.data.accountId}`);
  revalidatePath('/admin/solicitudes');

  return { success: 'Solicitud enviada. Te avisamos cuando se aplique.' };
}

// -----------------------------------------------------------------------------
// Operador
// -----------------------------------------------------------------------------

const aplicarSchema = z.object({ requestId: z.string().uuid('Solicitud no válida') });

/**
 * Aplicar el cambio: marca la solicitud como resuelta.
 *
 * El PIN nuevo se copia a `account_profiles` con el trigger
 * `aplicar_cambio_pin()`, no aquí: dejarlo en dos pasos manuales significaba que
 * la mitad de las veces el cliente seguía viendo el PIN viejo y volvía a pedir lo
 * mismo. El mismo trigger rellena `resolved_at` y `resolved_by`.
 */
export async function aplicarCambioPinAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = aplicarSchema.safeParse({ requestId: formData.get('requestId') });
  if (!parsed.success) {
    return { error: 'Solicitud no válida' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('pin_change_requests')
    .update({ status: 'done' })
    .eq('id', parsed.data.requestId);

  if (error) {
    logger.error('No se pudo aplicar el cambio de PIN', { error: error.message });
    return { error: 'No se pudo aplicar el cambio. Inténtalo de nuevo.' };
  }

  revalidatePath('/admin/solicitudes');
  revalidatePath('/dashboard');

  return { success: 'PIN actualizado. El cliente ya lo verá en su panel.' };
}

const rechazarSchema = z.object({
  requestId: z.string().uuid('Solicitud no válida'),
  note: z
    .string()
    .trim()
    .max(280)
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * Rechazar una solicitud sin tocar el PIN actual.
 *
 * A diferencia de aplicarla, aquí `resolved_at`/`resolved_by` se fijan a mano: el
 * trigger `aplicar_cambio_pin()` sólo actúa cuando el estado pasa a `done`.
 */
export async function rechazarCambioPinAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = rechazarSchema.safeParse({
    requestId: formData.get('requestId'),
    note: formData.get('note'),
  });

  if (!parsed.success) {
    return { error: 'Solicitud no válida' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('pin_change_requests')
    .update({
      status: 'rejected',
      note: parsed.data.note,
      resolved_at: new Date().toISOString(),
      resolved_by: admin.id,
    })
    .eq('id', parsed.data.requestId);

  if (error) {
    logger.error('No se pudo rechazar la solicitud de cambio de PIN', {
      error: error.message,
    });
    return { error: 'No se pudo rechazar la solicitud.' };
  }

  revalidatePath('/admin/solicitudes');

  return { success: 'Solicitud rechazada' };
}

// -----------------------------------------------------------------------------
// Códigos de proveedores externos
// -----------------------------------------------------------------------------

/**
 * Desenlace de pedir un código. Es un tipo cerrado y no un `ActionState` con
 * texto libre porque cada caso necesita un mensaje distinto en pantalla, y el
 * componente decide la redacción: la acción sólo dice qué pasó.
 */
export type ResultadoCodigo =
  | { estado: 'entregado'; codigos: number }
  | { estado: 'sin-correo' }
  | { estado: 'ya-leido' }
  | { estado: 'espera'; segundos: number }
  | { estado: 'error'; mensaje: string };

/**
 * Pedirle al proveedor el código de una cuenta propia.
 *
 * Sólo aplica a las cuentas cuyo buzón es de un tercero (hoy, GoPlay). Las de
 * buzón propio no tienen nada que pedir: el correo llega solo por el webhook.
 *
 * La autorización va en dos pasos y el orden importa. Primero se lee
 * `v_my_accounts` con el cliente **con sesión**, donde RLS decide: si la cuenta
 * no es del usuario, no hay fila y aquí se acaba. Sólo después se usa el cliente
 * administrativo para leer el identificador del proveedor, que vive en
 * `streaming_accounts` —una tabla que el cliente no puede leer, y está bien que
 * no pueda, porque contiene credenciales—.
 */
export async function pedirCodigoAction(accountId: string): Promise<ResultadoCodigo> {
  const user = await requireUser();

  if (!z.string().uuid().safeParse(accountId).success) {
    return { estado: 'error', mensaje: 'Cuenta no válida' };
  }

  // El proveedor entrega cada correo una sola vez, así que pulsar sin parar no
  // acelera nada y sí consume su API. El límite es por usuario y cuenta.
  const limite = rateLimit(`codigo-proveedor:${user.id}:${accountId}`, 6, 60_000);
  if (!limite.allowed) {
    return { estado: 'espera', segundos: limite.retryAfterSeconds };
  }

  const supabase = await createSupabaseServerClient();

  const { data: asignada, error: errorAsignada } = await supabase
    .from('v_my_accounts')
    .select('account_id, code_provider')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .eq('assignment_status', 'active')
    .maybeSingle();

  if (errorAsignada) {
    logger.error('No se pudo comprobar la asignación al pedir el código', {
      accountId,
      error: errorAsignada.message,
    });
    return { estado: 'error', mensaje: 'No se pudo comprobar tu cuenta. Probá de nuevo.' };
  }

  if (!asignada) {
    return { estado: 'error', mensaje: 'Esta cuenta no está asignada a tu usuario.' };
  }

  if (asignada.code_provider !== 'goplay') {
    return {
      estado: 'error',
      mensaje: 'Los códigos de esta cuenta llegan solos: no hay nada que pedir.',
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: cuenta, error: errorCuenta } = await admin
    .from('streaming_accounts')
    .select('inbox_email, provider_profile_id')
    .eq('id', accountId)
    .maybeSingle();

  if (errorCuenta || !cuenta?.provider_profile_id) {
    logger.error('Cuenta de proveedor sin configurar', {
      accountId,
      error: errorCuenta?.message ?? 'falta provider_profile_id',
    });
    return {
      estado: 'error',
      mensaje: 'Esta cuenta todavía no está conectada con el proveedor. Avisá al soporte.',
    };
  }

  const useCase = makeRequestGoPlayCodeUseCase();
  const resultado = await useCase.execute({
    providerProfileId: cuenta.provider_profile_id,
    inboxEmail: cuenta.inbox_email,
  });

  if (!resultado.ok) {
    return { estado: 'error', mensaje: resultado.error.message };
  }

  if (resultado.value.correos === 0) {
    return resultado.value.motivo === 'ya-leido' ? { estado: 'ya-leido' } : { estado: 'sin-correo' };
  }

  // El PIN entra por Realtime, pero se revalida igualmente: si la suscripción se
  // cayó, al recargar la pantalla el código ya está.
  revalidatePath(`/cuenta/${accountId}`);

  return { estado: 'entregado', codigos: resultado.value.codigos };
}
