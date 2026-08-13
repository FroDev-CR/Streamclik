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
  iconKey: string;
  isCombo: boolean;
  isCart: boolean;
  /** Renueva una asignación existente en vez de entregar un perfil nuevo. */
  isRenewal: boolean;
  items: Array<{
    name: string;
    slug: string;
    productType: 'service' | 'combo';
    quantity: number;
    unitPriceAmount: number;
    unitPriceCurrency: string;
    brandColor: string;
    iconKey: string;
  }>;
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
  id, status, is_cart, price_amount, price_currency, receipt_path, receipt_note,
  review_note, referral_code_used, submitted_at, created_at, renewal_assignment_id,
  streaming_services ( name, slug, brand_color, icon_key ),
  streaming_combos ( name, slug ),
  order_items (
    quantity, unit_price_amount, unit_price_currency,
    streaming_services ( name, slug, brand_color, icon_key ),
    streaming_combos ( name, slug )
  )
`;

type FilaPedido = {
  id: string;
  status: OrderStatus;
  is_cart: boolean;
  price_amount: number;
  price_currency: string;
  receipt_path: string | null;
  receipt_note: string | null;
  review_note: string | null;
  referral_code_used: string | null;
  submitted_at: string | null;
  created_at: string;
  renewal_assignment_id: string | null;
  streaming_services: {
    name: string;
    slug: string;
    brand_color: string;
    icon_key: string;
  } | null;
  streaming_combos: { name: string; slug: string } | null;
  order_items: Array<{
    quantity: number;
    unit_price_amount: number;
    unit_price_currency: string;
    streaming_services: {
      name: string;
      slug: string;
      brand_color: string;
      icon_key: string;
    } | null;
    streaming_combos: { name: string; slug: string } | null;
  }>;
};

function mapear(fila: FilaPedido): OrderRow {
  const items = fila.order_items.length
    ? fila.order_items.map((item) => ({
        name: item.streaming_combos?.name ?? item.streaming_services?.name ?? 'Producto',
        slug: item.streaming_combos?.slug ?? item.streaming_services?.slug ?? '',
        productType: (item.streaming_combos ? 'combo' : 'service') as 'service' | 'combo',
        quantity: item.quantity,
        unitPriceAmount: Number(item.unit_price_amount),
        unitPriceCurrency: item.unit_price_currency,
        brandColor: item.streaming_combos
          ? '#075dff'
          : (item.streaming_services?.brand_color ?? '#666666'),
        iconKey: item.streaming_combos ? 'generic' : (item.streaming_services?.icon_key ?? 'generic'),
      }))
    : [
        {
          name: fila.streaming_combos?.name ?? fila.streaming_services?.name ?? 'Servicio',
          slug: fila.streaming_combos?.slug ?? fila.streaming_services?.slug ?? '',
          productType: (fila.streaming_combos ? 'combo' : 'service') as 'service' | 'combo',
          quantity: 1,
          unitPriceAmount: Number(fila.price_amount),
          unitPriceCurrency: fila.price_currency,
          brandColor: fila.streaming_combos
            ? '#075dff'
            : (fila.streaming_services?.brand_color ?? '#666666'),
          iconKey: fila.streaming_combos
            ? 'generic'
            : (fila.streaming_services?.icon_key ?? 'generic'),
        },
      ];

  const units = items.reduce((total, item) => total + item.quantity, 0);
  const first = items[0]!;

  return {
    id: fila.id,
    status: fila.status,
    serviceName: fila.is_cart
      ? `${units} ${units === 1 ? 'producto' : 'productos'}`
      : first.name,
    serviceSlug: first.slug,
    brandColor: fila.is_cart ? '#075dff' : first.brandColor,
    iconKey: fila.is_cart ? 'generic' : first.iconKey,
    isCombo: Boolean(fila.streaming_combos),
    isCart: fila.is_cart,
    isRenewal: Boolean(fila.renewal_assignment_id),
    items,
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

export interface RenovacionInfo {
  assignmentId: string;
  serviceName: string;
  serviceSlug: string;
  brandColor: string;
  iconKey: string;
  accountLabel: string;
  profileLabel: string;
  expiresAt: string | null;
  priceAmount: number;
  priceCurrency: string;
  /** Id del pedido de renovación ya en curso, si lo hay. */
  renovacionEnCurso: string | null;
}

/**
 * Lo que hace falta para pintar la pantalla de renovación.
 *
 * Se lee con el cliente del usuario: RLS ya restringe `profile_assignments` a
 * las suyas, así que una asignación ajena vuelve vacía y la página responde 404
 * sin necesidad de comprobar la propiedad aquí.
 */
export async function getRenovacionInfo(assignmentId: string): Promise<RenovacionInfo | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('profile_assignments')
    .select(
      `
      id, expires_at, status,
      account_profiles (
        label,
        streaming_accounts (
          label,
          streaming_services ( name, slug, brand_color, icon_key, price_amount, price_currency )
        )
      )
    `,
    )
    .eq('id', assignmentId)
    .maybeSingle();

  if (error || !data) return null;

  type Fila = {
    id: string;
    expires_at: string | null;
    status: string;
    account_profiles: {
      label: string;
      streaming_accounts: {
        label: string;
        streaming_services: {
          name: string;
          slug: string;
          brand_color: string;
          icon_key: string;
          price_amount: number;
          price_currency: string;
        } | null;
      } | null;
    } | null;
  };

  const fila = data as unknown as Fila;
  const servicio = fila.account_profiles?.streaming_accounts?.streaming_services;

  if (!servicio) return null;

  // Si ya hay una renovación esperando, la pantalla lo dice en vez de dejar
  // crear otra y que el operador se encuentre dos pedidos por el mismo mes.
  const { data: enCurso } = await supabase
    .from('orders')
    .select('id')
    .eq('renewal_assignment_id', assignmentId)
    .in('status', ['esperando_comprobante', 'esperando_revision'])
    .maybeSingle();

  return {
    assignmentId: fila.id,
    serviceName: servicio.name,
    serviceSlug: servicio.slug,
    brandColor: servicio.brand_color,
    iconKey: servicio.icon_key,
    accountLabel: fila.account_profiles?.streaming_accounts?.label ?? '—',
    profileLabel: fila.account_profiles?.label ?? '—',
    expiresAt: fila.expires_at,
    priceAmount: Number(servicio.price_amount),
    priceCurrency: servicio.price_currency,
    renovacionEnCurso: enCurso?.id ?? null,
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
         quantity,
         streaming_services ( id, name, slug, brand_color, is_active )
       )`,
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return null;

  type ComboRow = typeof data & {
    streaming_combo_items: Array<{
      quantity: number;
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
    .filter((item) => Boolean(item.streaming_services?.is_active))
    .map((item) => ({
      ...item.streaming_services!,
      quantity: Number(item.quantity),
    }));

  if (services.reduce((total, service) => total + service.quantity, 0) < 2) return null;
  return { ...combo, services };
}
