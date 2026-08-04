import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

import type { OrderStatus } from './presentation';

/**
 * Consultas de pedidos.
 *
 * Como en el resto del panel, devuelven `{ data, error }` en vez de una lista
 * pelada: un pedido que no aparece por un fallo de consulta es indistinguible de
 * un pedido que no existe, y esa ambigüedad ya costó un ciclo de depuración.
 */

export interface OrderRow {
  id: string;
  status: OrderStatus;
  serviceName: string;
  serviceSlug: string;
  brandColor: string;
  isCombo: boolean;
  priceAmount: number;
  priceCurrency: string;
  receiptPath: string | null;
  receiptNote: string | null;
  reviewNote: string | null;
  referralCode: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface AdminOrderRow extends OrderRow {
  userId: string;
  userEmail: string;
  userName: string | null;
  userPhone: string | null;
  /** URL firmada y temporal del comprobante. Null si no hay o si falló. */
  receiptUrl: string | null;
}

export interface PaymentSettings {
  sinpeNumber: string;
  sinpeName: string;
  instructions: string;
}

interface QueryResult<T> {
  data: T;
  error: string | null;
}

const SELECT_PEDIDO = `
  id, status, price_amount, price_currency, receipt_path, receipt_note,
  review_note, referral_code_used, submitted_at, created_at,
  streaming_services ( name, slug, brand_color ),
  streaming_combos ( name, slug )
`;

type FilaPedido = {
  id: string;
  status: OrderStatus;
  price_amount: number;
  price_currency: string;
  receipt_path: string | null;
  receipt_note: string | null;
  review_note: string | null;
  referral_code_used: string | null;
  submitted_at: string | null;
  created_at: string;
  streaming_services: {
    name: string;
    slug: string;
    brand_color: string;
  } | null;
  streaming_combos: { name: string; slug: string } | null;
};

function mapear(fila: FilaPedido): OrderRow {
  return {
    id: fila.id,
    status: fila.status,
    serviceName: fila.streaming_combos?.name ?? fila.streaming_services?.name ?? 'Servicio',
    serviceSlug: fila.streaming_combos?.slug ?? fila.streaming_services?.slug ?? '',
    brandColor: fila.streaming_combos
      ? '#075dff'
      : (fila.streaming_services?.brand_color ?? '#666666'),
    isCombo: Boolean(fila.streaming_combos),
    priceAmount: Number(fila.price_amount),
    priceCurrency: fila.price_currency,
    receiptPath: fila.receipt_path,
    receiptNote: fila.receipt_note,
    reviewNote: fila.review_note,
    referralCode: fila.referral_code_used,
    submittedAt: fila.submitted_at,
    createdAt: fila.created_at,
  };
}

/** Pedidos del usuario en sesión. RLS ya los restringe a los suyos. */
export async function getMyOrders(): Promise<QueryResult<OrderRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('orders')
    .select(SELECT_PEDIDO)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('No se pudieron leer los pedidos del cliente', {
      error: error.message,
    });
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as unknown as FilaPedido[]).map(mapear),
    error: null,
  };
}

/**
 * Pedidos pendientes de revisar, para el operador.
 *
 * Genera una URL firmada por comprobante en lugar de exponer el bucket: el
 * comprobante lleva nombre, teléfono e importe, y un bucket público lo dejaría
 * accesible a cualquiera que diera con la ruta.
 */
export async function getPendingOrders(): Promise<QueryResult<AdminOrderRow[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('orders')
    .select(
      `${SELECT_PEDIDO},
       user_id,
       user_profiles!orders_user_id_fkey ( email, full_name, phone )`,
    )
    .eq('status', 'esperando_revision')
    .order('submitted_at', { ascending: true });

  if (error) {
    logger.error('No se pudieron leer los pedidos pendientes', {
      error: error.message,
      code: error.code,
    });
    return { data: [], error: error.message };
  }

  type FilaAdmin = FilaPedido & {
    user_id: string;
    user_profiles: {
      email: string;
      full_name: string | null;
      phone: string | null;
    } | null;
  };

  const filas = (data ?? []) as unknown as FilaAdmin[];

  const conUrl = await Promise.all(
    filas.map(async (fila) => {
      let receiptUrl: string | null = null;

      if (fila.receipt_path) {
        // Diez minutos: suficiente para revisarlo y corto para que un enlace
        // copiado por error no siga sirviendo mañana.
        const { data: firmada } = await supabase.storage
          .from('comprobantes')
          .createSignedUrl(fila.receipt_path, 600);

        receiptUrl = firmada?.signedUrl ?? null;
      }

      return {
        ...mapear(fila),
        userId: fila.user_id,
        userEmail: fila.user_profiles?.email ?? '—',
        userName: fila.user_profiles?.full_name ?? null,
        userPhone: fila.user_profiles?.phone ?? null,
        receiptUrl,
      };
    }),
  );

  return { data: conUrl, error: null };
}

/** Cuántos pedidos esperan revisión. Alimenta el aviso de la navegación. */
export async function countPendingOrders(): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'esperando_revision');

  return count ?? 0;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('payment_settings')
    .select('sinpe_number, sinpe_name, instructions')
    .maybeSingle();

  return {
    sinpeNumber: data?.sinpe_number ?? '',
    sinpeName: data?.sinpe_name ?? '',
    instructions: data?.instructions ?? '',
  };
}

/** Plataforma por slug, para la página de compra. */
export async function getServiceBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('streaming_services')
    .select('id, name, slug, brand_color, price_amount, price_currency, tagline')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  return data;
}

/** Combo por slug con las aplicaciones incluidas, para la pantalla de compra. */
export async function getComboBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('streaming_combos')
    .select(
      `id, name, slug, tagline, price_amount, price_currency,
       streaming_combo_items (
         streaming_services ( id, name, slug, brand_color, is_active )
       )`,
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return null;

  type ComboRow = typeof data & {
    streaming_combo_items: Array<{
      streaming_services: {
        id: string;
        name: string;
        slug: string;
        brand_color: string;
        is_active: boolean;
      } | null;
    }>;
  };

  const combo = data as unknown as ComboRow;
  const services = combo.streaming_combo_items
    .map((item) => item.streaming_services)
    .filter((service): service is NonNullable<typeof service> => Boolean(service?.is_active));

  if (services.length < 2) return null;
  return { ...combo, services };
}
