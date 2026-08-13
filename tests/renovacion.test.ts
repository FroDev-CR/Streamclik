import { describe, expect, it } from 'vitest';

import {
  diasHastaVencimiento,
  puedeRenovar,
  VENTANA_RENOVACION_DIAS,
} from '@/core/domain/entities';

const AHORA = new Date('2026-08-13T12:00:00Z');

function enDias(dias: number): string {
  return new Date(AHORA.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

describe('puedeRenovar', () => {
  it('no deja renovar cuando falta más que la ventana', () => {
    expect(
      puedeRenovar({ status: 'active', expiresAt: enDias(10) }, AHORA),
    ).toBe(false);
  });

  it('deja renovar justo dentro de la ventana', () => {
    expect(
      puedeRenovar({ status: 'active', expiresAt: enDias(VENTANA_RENOVACION_DIAS) }, AHORA),
    ).toBe(true);
  });

  it('deja renovar el mismo día del vencimiento', () => {
    expect(puedeRenovar({ status: 'active', expiresAt: enDias(0) }, AHORA)).toBe(true);
  });

  it('deja renovar una asignación que ya venció', () => {
    // Es el caso que más importa: alguien que se quedó sin servicio y quiere
    // volver. Si el botón desapareciera al vencer, tendría que comprar de nuevo
    // y le tocaría otro perfil distinto.
    expect(puedeRenovar({ status: 'active', expiresAt: enDias(-5) }, AHORA)).toBe(true);
  });

  it('no deja renovar una asignación sin vencimiento', () => {
    // No caduca: no hay nada que extender y cobrarlo sería cobrar por nada.
    expect(puedeRenovar({ status: 'active', expiresAt: null }, AHORA)).toBe(false);
  });

  it('no deja renovar una asignación revocada', () => {
    expect(puedeRenovar({ status: 'revoked', expiresAt: enDias(1) }, AHORA)).toBe(false);
  });
});

describe('diasHastaVencimiento', () => {
  it('cuenta los días que faltan', () => {
    expect(diasHastaVencimiento(enDias(3), AHORA)).toBe(3);
  });

  it('devuelve negativo cuando ya pasó', () => {
    expect(diasHastaVencimiento(enDias(-2), AHORA)).toBe(-2);
  });
});
