import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ORDER_STATUS, formatMoney, whatsappLink } from '../src/features/orders/presentation';

const MIGRACION = readFileSync('supabase/migrations/20260802001100_pedidos_y_pagos.sql', 'utf8');

/**
 * Extrae los valores del enum `order_status` de la migración.
 *
 * Se leen del SQL y no de una lista escrita aquí porque el objeto de esta prueba
 * es precisamente detectar cuándo la base de datos y la interfaz se separan.
 * Duplicar los valores en el test lo dejaría verde justo en el caso que debe
 * cazar.
 */
function estadosDeLaMigracion(): string[] {
  const bloque = MIGRACION.match(/create type public\.order_status as enum \(([\s\S]*?)\);/);
  if (!bloque?.[1]) throw new Error('No se encontró el enum order_status en la migración');

  return [...bloque[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe('estados del pedido', () => {
  it('cada estado del enum tiene su presentación', () => {
    // Sin esto, añadir un estado en SQL y olvidarlo aquí deja la tarjeta del
    // historial leyendo `undefined.etiqueta` y reventando en cliente, con el
    // pedido ya cobrado y el cliente mirando una pantalla en blanco.
    for (const estado of estadosDeLaMigracion()) {
      expect(ORDER_STATUS, `falta la presentación de «${estado}»`).toHaveProperty(estado);
    }
  });

  it('no sobra ninguna presentación sin estado en la base de datos', () => {
    const enLaBase = new Set(estadosDeLaMigracion());

    for (const estado of Object.keys(ORDER_STATUS)) {
      expect(enLaBase.has(estado), `«${estado}» no existe en el enum`).toBe(true);
    }
  });

  it('todos los estados dicen qué pasa y qué toca hacer', () => {
    for (const [estado, presentacion] of Object.entries(ORDER_STATUS)) {
      expect(presentacion.etiqueta.length, estado).toBeGreaterThan(0);
      expect(presentacion.detalle.length, estado).toBeGreaterThan(0);
    }
  });

  it('el pedido en revisión es el que el cliente ve como espera', () => {
    // La frase que pidió el operador. Si cambia, que sea una decisión y no un
    // descuido al retocar copys.
    expect(ORDER_STATUS.esperando_revision.detalle.toLowerCase()).toContain('comprobando pago');
  });
});

describe('formatMoney', () => {
  it('formatea colones sin decimales', () => {
    const salida = formatMoney(3500, 'CRC');

    // El símbolo y los separadores dependen de la versión de ICU, así que se
    // comprueba lo que de verdad importa: los dígitos y que no haya decimales.
    expect(salida).toContain('3');
    expect(salida).not.toContain(',00');
    expect(salida).not.toContain('.00');
  });

  it('no revienta con una moneda inválida', () => {
    // Un código mal escrito en la base de datos no debe tumbar la pantalla de
    // compra: `Intl.NumberFormat` lanza con códigos que no reconoce.
    expect(formatMoney(3500, 'NO-ES-UNA-MONEDA')).toBe('3500 NO-ES-UNA-MONEDA');
  });
});

describe('whatsappLink', () => {
  it('añade el prefijo de Costa Rica a un número local de ocho dígitos', () => {
    expect(whatsappLink('8888 8888')).toBe('https://wa.me/50688888888');
  });

  it('ignora espacios, guiones y paréntesis', () => {
    expect(whatsappLink('(8888)-8888')).toBe('https://wa.me/50688888888');
  });

  it('respeta un número que ya trae prefijo internacional', () => {
    // Anteponerle 506 a un móvil de otro país lo dejaría inservible.
    expect(whatsappLink('+506 8888 8888')).toBe('https://wa.me/50688888888');
    expect(whatsappLink('+34 600 123 456')).toBe('https://wa.me/34600123456');
  });
});
