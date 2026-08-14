import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Consultas de los reportes de cuenta.
 *
 * Devuelven `{ data, error }` en lugar de una lista pelada, como el resto del
 * panel: un reporte que no aparece por un fallo de consulta es indistinguible de
 * que no haya reportes, y esa ambigüedad ya costó un ciclo de depuración en este
 * proyecto.
 */

export type ReportStatus = 'pending' | 'resolved' | 'rejected';

interface QueryResult<T> {
  data: T;
  error: string | null;
}

export interface ReportableAccount {
  assignmentId: string;
  serviceName: string;
  accountLabel: string;
  profileLabel: string;
  iconKey: string;
}

/**
 * Las cuentas que el cliente puede reportar.
 *
 * Incluye las vencidas y las revocadas a propósito: «se me venció y no entiendo
 * por qué» y «dejó de funcionar» son dos de los motivos más frecuentes, y
 * filtrarlas dejaría fuera justo a quien más necesita escribir.
 */
export async function getReportableAccounts(): Promise<ReportableAccount[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('profile_assignments')
    .select(
      `
      id,
      account_profiles (
        label,
        streaming_accounts (
          label,
          streaming_services ( name, icon_key )
        )
      )
    `,
    )
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error) {
      logger.error('No se pudieron leer las cuentas reportables', { error: error.message });
    }
    return [];
  }

  type Fila = {
    id: string;
    account_profiles: {
      label: string;
      streaming_accounts: {
        label: string;
        streaming_services: { name: string; icon_key: string } | null;
      } | null;
    } | null;
  };

  return (data as unknown as Fila[]).map((fila) => ({
    assignmentId: fila.id,
    serviceName: fila.account_profiles?.streaming_accounts?.streaming_services?.name ?? 'Servicio',
    accountLabel: fila.account_profiles?.streaming_accounts?.label ?? '—',
    profileLabel: fila.account_profiles?.label ?? '—',
    iconKey: fila.account_profiles?.streaming_accounts?.streaming_services?.icon_key ?? 'generic',
  }));
}

export interface AdminReportRow {
  id: string;
  reason: string;
  createdAt: string;
  serviceName: string;
  accountLabel: string;
  profileLabel: string;
  iconKey: string;
  userEmail: string;
  userName: string | null;
  userPhone: string | null;
  /** URLs firmadas y temporales de las capturas. */
  screenshotUrls: string[];
}

/**
 * Reportes sin resolver, para el operador.
 *
 * Las capturas se sirven con URL firmada de diez minutos en lugar de exponer el
 * bucket: pueden llevar el correo de la cuenta y el nombre del perfil.
 *
 * ⚠️ `user_profiles!account_reports_reported_by_fkey` no es adorno:
 * `account_reports` apunta dos veces a `user_profiles` (`reported_by` y
 * `resolved_by`), y un embed sin cualificar es ambiguo — PostgREST rechaza la
 * consulta entera con PGRST201 y la lista vuelve vacía.
 */
export async function getPendingAccountReports(): Promise<QueryResult<AdminReportRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('account_reports')
    .select(
      `
      id, reason, screenshots, created_at,
      profile_assignments (
        account_profiles (
          label,
          streaming_accounts ( label, streaming_services ( name, icon_key ) )
        )
      ),
      user_profiles!account_reports_reported_by_fkey ( email, full_name, phone )
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('No se pudieron leer los reportes', { error: error.message, code: error.code });
    return { data: [], error: error.message };
  }

  type Fila = {
    id: string;
    reason: string;
    screenshots: string[];
    created_at: string;
    profile_assignments: {
      account_profiles: {
        label: string;
        streaming_accounts: {
          label: string;
          streaming_services: { name: string; icon_key: string } | null;
        } | null;
      } | null;
    } | null;
    user_profiles: { email: string; full_name: string | null; phone: string | null } | null;
  };

  const filas = (data ?? []) as unknown as Fila[];

  const conUrls = await Promise.all(
    filas.map(async (fila) => {
      const urls = await Promise.all(
        (fila.screenshots ?? []).map(async (ruta) => {
          const { data: firmada } = await supabase.storage
            .from('reportes')
            .createSignedUrl(ruta, 600);
          return firmada?.signedUrl ?? null;
        }),
      );

      const perfil = fila.profile_assignments?.account_profiles;

      return {
        id: fila.id,
        reason: fila.reason,
        createdAt: fila.created_at,
        serviceName: perfil?.streaming_accounts?.streaming_services?.name ?? 'Servicio',
        accountLabel: perfil?.streaming_accounts?.label ?? '—',
        profileLabel: perfil?.label ?? '—',
        iconKey: perfil?.streaming_accounts?.streaming_services?.icon_key ?? 'generic',
        userEmail: fila.user_profiles?.email ?? '—',
        userName: fila.user_profiles?.full_name ?? null,
        userPhone: fila.user_profiles?.phone ?? null,
        screenshotUrls: urls.filter((url): url is string => url !== null),
      };
    }),
  );

  return { data: conUrls, error: null };
}

/** Cuántos reportes esperan respuesta. Alimenta el aviso de la navegación. */
export async function countPendingAccountReports(): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from('account_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return count ?? 0;
}
