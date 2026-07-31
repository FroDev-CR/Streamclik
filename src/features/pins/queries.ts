import 'server-only';

import type { VerificationPin } from '@/core/domain/entities';
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

export async function getLatestPin(accountId: string): Promise<VerificationPin | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('verification_pins')
    .select('id, account_id, code, code_type, action_url, received_at, expires_at')
    .eq('account_id', accountId)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    accountId: data.account_id,
    code: data.code,
    codeType: data.code_type,
    actionUrl: data.action_url,
    receivedAt: data.received_at,
    expiresAt: data.expires_at,
  };
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
