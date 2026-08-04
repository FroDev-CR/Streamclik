import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { cartUnitCount, normalizeCart } from '../src/features/cart/storage';

const MIGRATION = readFileSync(
  'supabase/migrations/20260804001500_cart_orders.sql',
  'utf8',
);
const COMBO_QUANTITIES_MIGRATION = readFileSync(
  'supabase/migrations/20260804001700_combo_profile_quantities.sql',
  'utf8',
);

describe('carrito local', () => {
  it('consolida el mismo producto y suma cantidades', () => {
    expect(
      normalizeCart([
        { productType: 'service', slug: 'netflix', quantity: 1 },
        { productType: 'service', slug: 'netflix', quantity: 2 },
      ]),
    ).toEqual([{ productType: 'service', slug: 'netflix', quantity: 3 }]);
  });

  it('descarta entradas manipuladas y limita cantidades', () => {
    expect(
      normalizeCart([
        { productType: 'otro', slug: 'netflix', quantity: 1 },
        { productType: 'combo', slug: '  familiar  ', quantity: 100 },
      ]),
    ).toEqual([{ productType: 'combo', slug: 'familiar', quantity: 10 }]);
  });

  it('cuenta unidades, no sólo líneas', () => {
    expect(
      cartUnitCount([
        { productType: 'service', slug: 'netflix', quantity: 2 },
        { productType: 'combo', slug: 'familiar', quantity: 3 },
      ]),
    ).toBe(5);
  });
});

describe('entrega de carrito', () => {
  it('crea una cabecera, líneas y un RPC con precios validados en la base', () => {
    expect(MIGRATION).toContain('create table public.order_items');
    expect(MIGRATION).toContain('create or replace function public.crear_pedido_carrito');
    expect(MIGRATION).toContain('from public.streaming_services');
    expect(MIGRATION).toContain('from public.streaming_combos');
  });

  it('evita seleccionar dos veces el mismo perfil para cantidades mayores a uno', () => {
    expect(MIGRATION).toContain('not (ap.id = any(v_profile_ids))');
  });

  it('genera una sola recompensa por pedido completo', () => {
    expect(MIGRATION.match(/insert into public\.profile_rewards/g)).toHaveLength(1);
  });

  it('entrega varios perfiles de la misma app sin repetir el mismo slot', () => {
    expect(COMBO_QUANTITIES_MIGRATION).toContain('add column quantity');
    expect(COMBO_QUANTITIES_MIGRATION).toContain(
      'generate_series(1, combo_item.quantity)',
    );
    expect(COMBO_QUANTITIES_MIGRATION).toContain(
      'generate_series(1, item.quantity * combo_item.quantity)',
    );
    expect(COMBO_QUANTITIES_MIGRATION).toContain('not (ap.id = any(v_profile_ids))');
  });

  it('reduce los combos disponibles según la cantidad interna requerida', () => {
    expect(COMBO_QUANTITIES_MIGRATION).toContain(
      'min(coalesce(stock.disponibles, 0) / item.quantity)',
    );
    expect(COMBO_QUANTITIES_MIGRATION).toContain("'cantidad', item.quantity");
    expect(COMBO_QUANTITIES_MIGRATION).toContain('having sum(item.quantity) >= 2');
  });
});
