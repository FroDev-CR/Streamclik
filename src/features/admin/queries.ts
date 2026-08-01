import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { AccountStatus, AssignmentStatus } from '@/core/domain/entities';
import { logger } from '@/lib/logger';

/**
 * Consultas del panel de administración.
 *
 * Las filas visibles las determina RLS: si quien consulta no es administrador,
 * las políticas devuelven cero filas y la pantalla queda vacía en lugar de
 * exponer el inventario. No hace falta filtrar por rol aquí.
 *
 * ⚠️ Todas devuelven `{ data, error }` en lugar de una lista pelada. La versión
 * anterior hacía `const { data } = await …` y devolvía `[]` cuando algo fallaba,
 * lo que convirtió un error explícito de PostgREST en una pantalla vacía sin
 * ninguna pista. El síntoma resultante —"la cuenta se crea pero no aparece"— no
 * apunta en absoluto a su causa, y descartar el error es precisamente lo que
 * impedía verla.
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

/** Resultado de una consulta del panel: datos y, si lo hubo, el fallo real. */
export interface QueryResult<T> {
  data: T;
  error: string | null;
}

export interface InboundEmailRow {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  parseStatus: 'parsed' | 'unmatched' | 'failed' | 'ignored';
  receivedAt: string;
  accountId: string | null;
}

/**
 * Últimos correos que llegaron a los buzones de ingesta.
 *
 * No es un adorno de diagnóstico: hay correos legítimos que **no** contienen
 * ningún código y que aun así el operador necesita ver. El caso concreto es
 * cambiar la dirección de una cuenta de Netflix a un buzón de StreamClick:
 * Netflix manda un enlace de confirmación, no un número, así que el parser lo
 * marca como `unmatched` y no aparece en ninguna otra pantalla. Sin esta vista,
 * ese correo se recibe correctamente y se pierde de vista.
 *
 * La política RLS de `inbound_emails` es sólo para administradores: el cuerpo de
 * los correos no debe llegar al cliente final.
 */
export async function getRecentInboundEmails(limit = 15): Promise<QueryResult<InboundEmailRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('inbound_emails')
    .select('id, from_address, to_address, subject, parse_status, received_at, account_id')
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('No se pudieron leer los correos entrantes', { error: error.message });
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      subject: row.subject,
      parseStatus: row.parse_status,
      receivedAt: row.received_at,
      accountId: row.account_id,
    })),
    error: null,
  };
}

export async function getServiceOptions(): Promise<QueryResult<AdminServiceOption[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('streaming_services')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  if (error) {
    logger.error('No se pudo leer el catálogo de servicios', { error: error.message });
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getClientOptions(): Promise<QueryResult<AdminClientOption[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .eq('role', 'client')
    .order('email');

  if (error) {
    logger.error('No se pudo leer la lista de clientes', { error: error.message });
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
    })),
    error: null,
  };
}

/**
 * Inventario completo con sus asignaciones.
 *
 * Se resuelve con una sola consulta anidada de PostgREST en vez de con una
 * consulta por cuenta: con 30 cuentas y 5 perfiles cada una, el patrón N+1
 * serían 150 llamadas de ida y vuelta.
 *
 * ⚠️ `user_profiles!profile_assignments_user_id_fkey` NO es adorno. La tabla
 * `profile_assignments` tiene **dos** claves foráneas hacia `user_profiles`
 * (`user_id` y `assigned_by`), así que un embed sin cualificar es ambiguo y
 * PostgREST lo rechaza con PGRST201 «more than one relationship was found».
 * La consulta entera falla, no sólo esa rama, y el inventario vuelve vacío.
 * Al añadir cualquier relación nueva hacia `user_profiles` hay que nombrar la
 * clave foránea igual que aquí.
 */
export async function getAdminAccounts(): Promise<QueryResult<AdminAccountRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('streaming_accounts')
    .select(
      `
      id, label, inbox_email, status, max_profiles,
      streaming_services ( name, brand_color ),
      account_profiles (
        id, label, slot_index,
        profile_assignments (
          id, user_id, status, expires_at,
          user_profiles!profile_assignments_user_id_fkey ( email )
        )
      )
    `,
    )
    .order('label');

  if (error) {
    logger.error('No se pudo leer el inventario de cuentas', {
      error: error.message,
      code: error.code,
    });
    return { data: [], error: error.message };
  }

  if (!data) return { data: [], error: null };

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

  return {
    data: (data as unknown as NestedRow[]).map((account) => ({
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
    })),
    error: null,
  };
}
