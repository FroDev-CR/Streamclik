import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { AccountStatus, AssignmentStatus } from '@/core/domain/entities';

/**
 * Consultas del panel de administración.
 *
 * Las filas visibles las determina RLS: si quien consulta no es administrador,
 * las políticas devuelven cero filas y la pantalla queda vacía en lugar de
 * exponer el inventario. No hace falta filtrar por rol aquí.
 */

export interface AdminServiceOption {
  id: string;
  name: string;
  slug: string;
}

export interface AdminClientOption {
  id: string;
  email: string;
  fullName: string | null;
}

export interface AdminProfileRow {
  profileId: string;
  profileLabel: string;
  slotIndex: number;
  assignment: {
    id: string;
    userId: string;
    userEmail: string;
    status: AssignmentStatus;
    expiresAt: string | null;
  } | null;
}

export interface AdminAccountRow {
  id: string;
  label: string;
  inboxEmail: string;
  serviceName: string;
  brandColor: string;
  status: AccountStatus;
  maxProfiles: number;
  profiles: AdminProfileRow[];
}

export async function getServiceOptions(): Promise<AdminServiceOption[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('streaming_services')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  return data ?? [];
}

export async function getClientOptions(): Promise<AdminClientOption[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .eq('role', 'client')
    .order('email');

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
  }));
}

/**
 * Inventario completo con sus asignaciones.
 *
 * Se resuelve con una sola consulta anidada de PostgREST en vez de con una
 * consulta por cuenta: con 30 cuentas y 5 perfiles cada una, el patrón N+1
 * serían 150 llamadas de ida y vuelta.
 */
export async function getAdminAccounts(): Promise<AdminAccountRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('streaming_accounts')
    .select(
      `
      id, label, inbox_email, status, max_profiles,
      streaming_services ( name, brand_color ),
      account_profiles (
        id, label, slot_index,
        profile_assignments ( id, user_id, status, expires_at, user_profiles ( email ) )
      )
    `,
    )
    .order('label');

  if (!data) return [];

  type NestedRow = {
    id: string;
    label: string;
    inbox_email: string;
    status: AccountStatus;
    max_profiles: number;
    streaming_services: { name: string; brand_color: string } | null;
    account_profiles: Array<{
      id: string;
      label: string;
      slot_index: number;
      profile_assignments: Array<{
        id: string;
        user_id: string;
        status: AssignmentStatus;
        expires_at: string | null;
        user_profiles: { email: string } | null;
      }>;
    }>;
  };

  return (data as unknown as NestedRow[]).map((account) => ({
    id: account.id,
    label: account.label,
    inboxEmail: account.inbox_email,
    serviceName: account.streaming_services?.name ?? 'Servicio',
    brandColor: account.streaming_services?.brand_color ?? '#666666',
    status: account.status,
    maxProfiles: account.max_profiles,
    profiles: [...account.account_profiles]
      .sort((a, b) => a.slot_index - b.slot_index)
      .map((profile) => {
        // Sólo interesa la asignación vigente. El índice único parcial
        // `one_active_assignment_per_profile` garantiza que haya como mucho una.
        const active = profile.profile_assignments.find((item) => item.status === 'active');

        return {
          profileId: profile.id,
          profileLabel: profile.label,
          slotIndex: profile.slot_index,
          assignment: active
            ? {
                id: active.id,
                userId: active.user_id,
                userEmail: active.user_profiles?.email ?? '—',
                status: active.status,
                expiresAt: active.expires_at,
              }
            : null,
        };
      }),
  }));
}
