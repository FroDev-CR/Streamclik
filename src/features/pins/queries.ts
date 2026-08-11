import 'server-only';

import {
  LIVE_PIN_WINDOW_SECONDS,
  MAX_LIVE_PINS,
  type VerificationPin,
} from '@/core/domain/entities';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Consultas de lectura de PIN.
 *
 * No pasan por un caso de uso a propósito (ADR-0006): no hay ninguna invariante
 * de negocio que proteger y la autorización ya la aplica RLS. Un caso de uso que
 * sólo reenviara la llamada al repositorio sería indirección sin propósito.
 *
 * Nótese la ausencia de `WHERE user_id = …`: las políticas de
 * `verification_pins` restringen las filas en Postgres. Si esa condición
 * estuviera aquí, protegería únicamente este camino de código y no la
 * suscripción de Realtime ni una llamada directa a la API.
 */

/**
 * Códigos que deben verse en vivo al pintar la página.
 *
 * Se piden los de los últimos minutos y no sólo el último porque los perfiles de
 * una cuenta comparten buzón: dos inquilinos que piden código casi a la vez
 * generan dos correos, y quedarse con el más reciente hacía desaparecer el del
 * otro sin avisar.
 *
 * El corte por fecha va en la consulta y no en el cliente para no traerse el
 * historial entero en cada carga.
 */
export async function getLivePins(accountId: string): Promise<VerificationPin[]> {
  const supabase = await createSupabaseServerClient();

  const desde = new Date(Date.now() - LIVE_PIN_WINDOW_SECONDS * 1000).toISOString();

  const { data } = await supabase
    .from('verification_pins')
    .select('id, account_id, code, code_type, action_url, received_at, expires_at')
    .eq('account_id', accountId)
    .gte('received_at', desde)
    .order('received_at', { ascending: false })
    .limit(MAX_LIVE_PINS);

  return (data ?? []).map((row) => ({
    id: row.id,
    accountId: row.account_id,
    code: row.code,
    codeType: row.code_type,
    actionUrl: row.action_url,
    receivedAt: row.received_at,
    expiresAt: row.expires_at,
  }));
}

/** Historial paginado. El límite por defecto cubre lo que cabe sin scroll infinito. */
export async function getPinHistory(accountId: string, limit = 20): Promise<VerificationPin[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('verification_pins')
    .select('id, account_id, code, code_type, action_url, received_at, expires_at')
    .eq('account_id', accountId)
    .order('received_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    accountId: row.account_id,
    code: row.code,
    codeType: row.code_type,
    actionUrl: row.action_url,
    receivedAt: row.received_at,
    expiresAt: row.expires_at,
  }));
}

// -----------------------------------------------------------------------------
// Solicitudes de cambio de PIN
// -----------------------------------------------------------------------------
// El cliente no puede cambiar el PIN de su perfil por su cuenta (ver
// supabase/migrations/20260807001800_solicitudes_cambio_pin.sql): lo pide, y el
// operador entra a la plataforma y lo aplica.

export type PinChangeStatus = 'pending' | 'done' | 'rejected';

interface QueryResult<T> {
  data: T;
  error: string | null;
}

export interface PinChangeRequestStatusRow {
  id: string;
  requestedPin: string;
  status: PinChangeStatus;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Última solicitud de cambio de PIN del perfil, la haya o no.
 *
 * No se filtra por usuario aquí: la política de `SELECT` de
 * `pin_change_requests` ya restringe las filas a las propias del cliente en
 * sesión (o a todas si es administrador). Repetir el filtro en TypeScript no
 * añadiría seguridad, sólo una condición que puede divergir de la de Postgres.
 */
export async function getLatestPinChangeRequest(
  accountProfileId: string,
): Promise<PinChangeRequestStatusRow | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('pin_change_requests')
    .select('id, requested_pin, status, note, created_at, resolved_at')
    .eq('account_profile_id', accountProfileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    requestedPin: data.requested_pin,
    status: data.status,
    note: data.note,
    createdAt: data.created_at,
    resolvedAt: data.resolved_at,
  };
}

export interface PendingPinChangeRequestRow {
  id: string;
  requestedPin: string;
  note: string | null;
  createdAt: string;
  profileLabel: string;
  accountLabel: string;
  serviceName: string;
  brandColor: string;
  iconKey: string;
  userEmail: string;
  userName: string | null;
}

/**
 * Solicitudes pendientes de resolver, para el operador. Ordenadas por
 * antigüedad: es el orden en el que hay que atenderlas.
 *
 * ⚠️ `user_profiles!pin_change_requests_requested_by_fkey` no es adorno.
 * `pin_change_requests` tiene dos claves foráneas hacia `user_profiles`
 * (`requested_by` y `resolved_by`); un embed sin cualificar es ambiguo y
 * PostgREST rechaza la consulta entera con PGRST201.
 */
export async function getPendingPinChangeRequests(): Promise<
  QueryResult<PendingPinChangeRequestRow[]>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('pin_change_requests')
    .select(
      `
      id, requested_pin, note, created_at,
      account_profiles (
        label,
        streaming_accounts ( label, streaming_services ( name, brand_color, icon_key ) )
      ),
      user_profiles!pin_change_requests_requested_by_fkey ( email, full_name )
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('No se pudieron leer las solicitudes de cambio de PIN', {
      error: error.message,
      code: error.code,
    });
    return { data: [], error: error.message };
  }

  type Fila = {
    id: string;
    requested_pin: string;
    note: string | null;
    created_at: string;
    account_profiles: {
      label: string;
      streaming_accounts: {
        label: string;
        streaming_services: { name: string; brand_color: string; icon_key: string } | null;
      } | null;
    } | null;
    user_profiles: { email: string; full_name: string | null } | null;
  };

  return {
    data: ((data ?? []) as unknown as Fila[]).map((fila) => ({
      id: fila.id,
      requestedPin: fila.requested_pin,
      note: fila.note,
      createdAt: fila.created_at,
      profileLabel: fila.account_profiles?.label ?? '—',
      accountLabel: fila.account_profiles?.streaming_accounts?.label ?? '—',
      serviceName:
        fila.account_profiles?.streaming_accounts?.streaming_services?.name ?? 'Servicio',
      brandColor:
        fila.account_profiles?.streaming_accounts?.streaming_services?.brand_color ?? '#666666',
      iconKey:
        fila.account_profiles?.streaming_accounts?.streaming_services?.icon_key ?? 'generic',
      userEmail: fila.user_profiles?.email ?? '—',
      userName: fila.user_profiles?.full_name ?? null,
    })),
    error: null,
  };
}

/** Cuántas solicitudes esperan resolución. Alimenta el aviso de la navegación. */
export async function countPendingPinChangeRequests(): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from('pin_change_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return count ?? 0;
}
