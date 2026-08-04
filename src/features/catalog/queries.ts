import 'server-only';

import { createSupabasePublicClient } from '@/infrastructure/supabase/public-client';
import { logger } from '@/lib/logger';

/**
 * Catálogo público del escaparate.
 *
 * Se lee con el cliente **sin identidad**: la portada no necesita saber quién la
 * visita. La función `catalogo_publico()` devuelve sólo agregados —nombre,
 * precio y un recuento de perfiles libres—, nunca datos de cuentas.
 */

export interface CatalogItem {
  slug: string;
  nombre: string;
  color: string;
  icono: string;
  lema: string | null;
  precio: number;
  moneda: string;
  disponibles: number;
  total: number;
}

export interface CatalogComboService {
  slug: string;
  nombre: string;
  color: string;
  icono: string;
  cantidad: number;
}

export interface CatalogCombo {
  slug: string;
  nombre: string;
  lema: string | null;
  precio: number;
  moneda: string;
  disponibles: number;
  servicios: CatalogComboService[];
}

export async function getPublicCatalog(): Promise<CatalogItem[]> {
  try {
    const supabase = createSupabasePublicClient();

    const { data, error } = await supabase.rpc('catalogo_publico');

    if (error) {
      logger.error('No se pudo leer el catálogo público', {
        error: error.message,
      });
      return [];
    }

    return (data ?? []) as CatalogItem[];
  } catch (causa) {
    // La portada nunca debe caerse por el catálogo: es la primera impresión del
    // producto y sin la sección sigue siendo una página válida. La sección se
    // oculta sola al no haber elementos.
    //
    // El `try` cubre también la construcción del cliente, que valida las
    // variables de entorno y lanza si faltan. Sin esto, `next build` falla al
    // prerenderizar `/` en cualquier entorno sin configurar —CI incluido— con un
    // error de prerender que no señala la causa real.
    logger.error('El catálogo público no está disponible', {
      error: causa instanceof Error ? causa.message : String(causa),
    });
    return [];
  }
}

/** Combos públicos con stock calculado a partir del servicio más limitado. */
export async function getPublicCombos(): Promise<CatalogCombo[]> {
  try {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc('combos_publicos');

    if (error) {
      logger.error('No se pudieron leer los combos públicos', {
        error: error.message,
      });
      return [];
    }

    return (data ?? []).map((combo) => ({
      ...combo,
      precio: Number(combo.precio),
      disponibles: Number(combo.disponibles),
      servicios: Array.isArray(combo.servicios)
        ? (combo.servicios as unknown as CatalogComboService[]).map((service) => ({
            ...service,
            cantidad: Math.max(1, Number(service.cantidad ?? 1)),
          }))
        : [],
    }));
  } catch (causa) {
    logger.error('Los combos públicos no están disponibles', {
      error: causa instanceof Error ? causa.message : String(causa),
    });
    return [];
  }
}

/**
 * Formatea el precio con la moneda del servicio.
 *
 * `Intl.NumberFormat` con `es-CR` pone el símbolo y los separadores correctos, y
 * `maximumFractionDigits: 0` evita el «₡3.500,00» que nadie escribe al hablar de
 * un precio mensual redondo.
 */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Una moneda mal escrita en la base de datos no debe tumbar la portada.
    return `${amount} ${currency}`;
  }
}
