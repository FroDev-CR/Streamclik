import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { AccountStatus, AssignmentStatus } from '@/core/domain/entities';
import type { RawEmail } from '@/core/ports/email-parser';
import { tryDecrypt } from '@/infrastructure/crypto/credential-cipher';
import { htmlToText } from '@/infrastructure/email/html-to-text';
import { emailParsers } from '@/infrastructure/email/parsers/registry';
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
  isActive: boolean;
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
  serviceId: string;
  label: string;
  inboxEmail: string;
  loginEmail: string;
  loginPassword: string | null;
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
  body: string;
  parseError: string | null;
  serviceSlug: string | null;
  serviceName: string | null;
}

const SERVICE_NAMES: Record<string, string> = {
  netflix: 'Netflix',
  'disney-plus': 'Disney+',
  max: 'Max',
  'prime-video': 'Prime Video',
};

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
    .select(
      'id, from_address, to_address, subject, body_text, body_html, parse_status, parse_error, received_at, account_id',
    )
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('No se pudieron leer los correos entrantes', {
      error: error.message,
    });
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => {
      const rawEmail: RawEmail = {
        from: row.from_address,
        to: row.to_address,
        subject: row.subject ?? '',
        text: row.body_text,
        html: row.body_html,
      };
      const parser = emailParsers.find((candidate) => candidate.canHandle(rawEmail));
      const serviceSlug = parser?.serviceSlug ?? null;

      return {
        id: row.id,
        fromAddress: row.from_address,
        toAddress: row.to_address,
        subject: row.subject,
        parseStatus: row.parse_status,
        receivedAt: row.received_at,
        accountId: row.account_id,
        body: row.body_text?.trim() || (row.body_html ? htmlToText(row.body_html) : ''),
        parseError: row.parse_error,
        serviceSlug,
        serviceName: serviceSlug ? (SERVICE_NAMES[serviceSlug] ?? serviceSlug) : null,
      };
    }),
    error: null,
  };
}

export async function getServiceOptions(
  includeInactive = false,
): Promise<QueryResult<AdminServiceOption[]>> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('streaming_services')
    .select('id, name, slug, is_active')
    .order('name');

  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;

  if (error) {
    logger.error('No se pudo leer el catálogo de servicios', {
      error: error.message,
    });
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      slug: service.slug,
      isActive: service.is_active,
    })),
    error: null,
  };
}

/**
 * Clientes a los que se puede asignar un perfil.
 *
 * Sólo usuarios con rol `client`. Durante la puesta en marcha se incluyó también
 * al operador para poder probar de punta a punta que los códigos llegaban, pero
 * era una muleta: el inventario es lo que se vende, y un administrador ocupando
 * un perfil lo hace parecer vendido en el contador de ocupación.
 */
export async function getClientOptions(): Promise<QueryResult<AdminClientOption[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .eq('role', 'client')
    .order('email');

  if (error) {
    logger.error('No se pudo leer la lista de clientes', {
      error: error.message,
    });
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
      id, service_id, label, inbox_email, login_email, login_password_enc, status, max_profiles,
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
    service_id: string;
    label: string;
    inbox_email: string;
    login_email: string;
    login_password_enc: string;
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
      serviceId: account.service_id,
      label: account.label,
      inboxEmail: account.inbox_email,
      loginEmail: account.login_email,
      loginPassword: tryDecrypt(account.login_password_enc),
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

// -----------------------------------------------------------------------------

export interface AdminClientRow {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  referralCode: string;
  createdAt: string;
  suscripciones: Array<{
    assignmentId: string;
    serviceName: string;
    brandColor: string;
    accountLabel: string;
    profileLabel: string;
    expiresAt: string | null;
  }>;
  rewards: Array<{
    id: string;
    status: 'available' | 'claimed' | 'cancelled';
    source: 'referral' | 'admin';
    durationDays: number;
    note: string | null;
    serviceName: string | null;
    createdAt: string;
  }>;
}

/**
 * Todos los clientes con lo que tienen contratado.
 *
 * Responde a la pregunta inversa del banco: el banco parte del inventario y
 * pregunta quién lo ocupa; esto parte de la persona y pregunta qué tiene. Son
 * las dos formas de mirar el mismo dato, y el operador necesita ambas —una para
 * vender el hueco libre, otra para atender a quien escribe.
 *
 * ⚠️ El embed nombra la clave foránea (`profile_assignments!…_user_id_fkey`)
 * porque `profile_assignments` apunta dos veces a `user_profiles` (`user_id` y
 * `assigned_by`). Sin cualificar, PostgREST rechaza la consulta entera con
 * PGRST201 y la lista vuelve vacía.
 */
export async function getAdminClients(): Promise<QueryResult<AdminClientRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('user_profiles')
    .select(
      `
      id, email, full_name, phone, referral_code, created_at,
      profile_assignments!profile_assignments_user_id_fkey (
        id, status, expires_at,
        account_profiles (
          label,
          streaming_accounts ( label, streaming_services ( name, brand_color ) )
        )
      ),
      profile_rewards!profile_rewards_user_id_fkey (
        id, status, source, duration_days, note, created_at,
        claimed_service:streaming_services!profile_rewards_claimed_service_id_fkey ( name )
      )
    `,
    )
    .eq('role', 'client')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('No se pudo leer la lista de clientes', {
      error: error.message,
      code: error.code,
    });
    return { data: [], error: error.message };
  }

  type Fila = {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    referral_code: string;
    created_at: string;
    profile_assignments: Array<{
      id: string;
      status: AssignmentStatus;
      expires_at: string | null;
      account_profiles: {
        label: string;
        streaming_accounts: {
          label: string;
          streaming_services: { name: string; brand_color: string } | null;
        } | null;
      } | null;
    }>;
    profile_rewards: Array<{
      id: string;
      status: 'available' | 'claimed' | 'cancelled';
      source: 'referral' | 'admin';
      duration_days: number;
      note: string | null;
      created_at: string;
      claimed_service: { name: string } | null;
    }>;
  };

  return {
    data: ((data ?? []) as unknown as Fila[]).map((fila) => ({
      id: fila.id,
      email: fila.email,
      fullName: fila.full_name,
      phone: fila.phone,
      referralCode: fila.referral_code,
      createdAt: fila.created_at,
      suscripciones: fila.profile_assignments
        // Sólo lo vigente: el historial de asignaciones revocadas es útil para
        // auditar, pero aquí la pregunta es qué tiene contratado ahora.
        .filter((asignacion) => asignacion.status === 'active')
        .map((asignacion) => ({
          assignmentId: asignacion.id,
          serviceName:
            asignacion.account_profiles?.streaming_accounts?.streaming_services?.name ?? 'Servicio',
          brandColor:
            asignacion.account_profiles?.streaming_accounts?.streaming_services?.brand_color ??
            '#666666',
          accountLabel: asignacion.account_profiles?.streaming_accounts?.label ?? '—',
          profileLabel: asignacion.account_profiles?.label ?? '—',
          expiresAt: asignacion.expires_at,
        })),
      rewards: fila.profile_rewards
        .map((reward) => ({
          id: reward.id,
          status: reward.status,
          source: reward.source,
          durationDays: reward.duration_days,
          note: reward.note,
          serviceName: reward.claimed_service?.name ?? null,
          createdAt: reward.created_at,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    })),
    error: null,
  };
}

// -----------------------------------------------------------------------------

export interface AdminPlatformRow {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  iconKey: string;
  priceAmount: number;
  tagline: string | null;
  senderDomains: string[];
  isActive: boolean;
  accountCount: number;
}

export interface AdminComboRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  priceAmount: number;
  priceCurrency: string;
  isActive: boolean;
  services: Array<{
    id: string;
    name: string;
    slug: string;
    brandColor: string;
    quantity: number;
  }>;
}

/**
 * Plataformas del catálogo, incluidas las ocultas.
 *
 * A diferencia de `getServiceOptions()`, aquí NO se filtra por `is_active`: esta
 * pantalla existe justamente para volver a mostrar una plataforma que se ocultó.
 *
 * El recuento de cuentas se trae para poder avisar de lo que arrastra: ocultar
 * una plataforma con cuentas activas deja de venderla, pero los clientes que ya
 * la tienen conservan su acceso.
 */
export async function getAdminPlatforms(): Promise<QueryResult<AdminPlatformRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('streaming_services')
    .select(
      'id, slug, name, brand_color, icon_key, price_amount, tagline, sender_domains, is_active, streaming_accounts(id)',
    )
    .order('name');

  if (error) {
    logger.error('No se pudieron leer las plataformas', {
      error: error.message,
    });
    return { data: [], error: error.message };
  }

  type Fila = {
    id: string;
    slug: string;
    name: string;
    brand_color: string;
    icon_key: string;
    price_amount: number;
    tagline: string | null;
    sender_domains: string[];
    is_active: boolean;
    streaming_accounts: Array<{ id: string }>;
  };

  return {
    data: ((data ?? []) as unknown as Fila[]).map((fila) => ({
      id: fila.id,
      slug: fila.slug,
      name: fila.name,
      brandColor: fila.brand_color,
      iconKey: fila.icon_key,
      priceAmount: Number(fila.price_amount),
      tagline: fila.tagline,
      senderDomains: fila.sender_domains,
      isActive: fila.is_active,
      accountCount: fila.streaming_accounts?.length ?? 0,
    })),
    error: null,
  };
}

/** Paquetes configurados por el operador, incluidos los que están ocultos. */
export async function getAdminCombos(): Promise<QueryResult<AdminComboRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('streaming_combos')
    .select(
      `id, slug, name, tagline, price_amount, price_currency, is_active,
       streaming_combo_items (
         quantity,
         streaming_services ( id, name, slug, brand_color )
       )`,
    )
    .order('name');

  if (error) {
    logger.error('No se pudieron leer los combos', { error: error.message });
    return { data: [], error: error.message };
  }

  type Fila = {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    price_amount: number;
    price_currency: string;
    is_active: boolean;
    streaming_combo_items: Array<{
      quantity: number;
      streaming_services: {
        id: string;
        name: string;
        slug: string;
        brand_color: string;
      } | null;
    }>;
  };

  return {
    data: ((data ?? []) as unknown as Fila[]).map((fila) => ({
      id: fila.id,
      slug: fila.slug,
      name: fila.name,
      tagline: fila.tagline,
      priceAmount: Number(fila.price_amount),
      priceCurrency: fila.price_currency,
      isActive: fila.is_active,
      services: fila.streaming_combo_items
        .filter((item) => Boolean(item.streaming_services))
        .map((item) => ({
          id: item.streaming_services!.id,
          name: item.streaming_services!.name,
          slug: item.streaming_services!.slug,
          brandColor: item.streaming_services!.brand_color,
          quantity: Number(item.quantity),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    })),
    error: null,
  };
}
