import 'server-only';

import {
  LIVE_PIN_WINDOW_SECONDS,
  MAX_LIVE_PINS,
  type VerificationPin,
} from '@/core/domain/entities';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';

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
