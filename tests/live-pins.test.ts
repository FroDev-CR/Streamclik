import { describe, expect, it } from 'vitest';

import {
  LIVE_PIN_WINDOW_SECONDS,
  MAX_LIVE_PINS,
  isPinExpired,
  isWithinLiveWindow,
  selectLivePins,
  type VerificationPin,
} from '../src/core/domain/entities';

/**
 * La vista en vivo de los códigos.
 *
 * Estas reglas existen por un caso concreto: los perfiles de una cuenta
 * comparten buzón, así que dos inquilinos que piden código con un minuto de
 * diferencia generan dos correos. Antes el segundo sustituía al primero en
 * pantalla y quien pidió primero tomaba por suyo el código del otro.
 */

const AHORA = new Date('2026-08-02T12:00:00Z');

function pin(id: string, segundosAtras: number, ttlSegundos = 900): VerificationPin {
  const receivedAt = new Date(AHORA.getTime() - segundosAtras * 1000);

  return {
    id,
    accountId: 'cuenta-1',
    code: '123456',
    codeType: 'household',
    actionUrl: null,
    receivedAt: receivedAt.toISOString(),
    expiresAt: new Date(receivedAt.getTime() + ttlSegundos * 1000).toISOString(),
  };
}

describe('ventana en vivo', () => {
  it('mantiene un código recién llegado', () => {
    expect(isWithinLiveWindow(pin('a', 10), AHORA)).toBe(true);
  });

  it('descarta el que ya pasó la ventana', () => {
    expect(isWithinLiveWindow(pin('a', LIVE_PIN_WINDOW_SECONDS + 1), AHORA)).toBe(false);
  });

  it('la ventana NO es la caducidad del código', () => {
    // Es la distinción que evita mentirle al cliente: a los 6 minutos el código
    // sale de la vista en vivo, pero en Netflix sigue funcionando. Si se
    // fundieran, leería «caducado» sobre un código válido y pediría otro para
    // nada.
    const codigo = pin('a', LIVE_PIN_WINDOW_SECONDS + 60);

    expect(isWithinLiveWindow(codigo, AHORA)).toBe(false);
    expect(isPinExpired(codigo, AHORA)).toBe(false);
  });
});

describe('selectLivePins', () => {
  it('muestra los códigos simultáneos en vez de quedarse con el último', () => {
    // El caso que motiva todo esto: dos inquilinos piden con un minuto de
    // diferencia. Ambos códigos tienen que verse.
    const visibles = selectLivePins([pin('luis', 20), pin('ana', 80)], AHORA);

    expect(visibles.map((p) => p.id)).toEqual(['luis', 'ana']);
  });

  it('ordena del más reciente al más antiguo aunque lleguen desordenados', () => {
    // Realtime reenvía eventos al reconectar el WebSocket, así que el orden de
    // entrada no es de fiar.
    const visibles = selectLivePins([pin('viejo', 200), pin('nuevo', 5), pin('medio', 100)], AHORA);

    expect(visibles.map((p) => p.id)).toEqual(['nuevo', 'medio', 'viejo']);
  });

  it('deja fuera los que salieron de la ventana', () => {
    const visibles = selectLivePins(
      [pin('dentro', 30), pin('fuera', LIVE_PIN_WINDOW_SECONDS + 30)],
      AHORA,
    );

    expect(visibles.map((p) => p.id)).toEqual(['dentro']);
  });

  it('nunca muestra más de MAX_LIVE_PINS', () => {
    const muchos = Array.from({ length: MAX_LIVE_PINS + 3 }, (_, i) => pin(`p${i}`, i * 10));

    expect(selectLivePins(muchos, AHORA)).toHaveLength(MAX_LIVE_PINS);
  });

  it('al recortar conserva los más recientes, no los primeros de la lista', () => {
    const muchos = Array.from({ length: MAX_LIVE_PINS + 2 }, (_, i) => pin(`p${i}`, i * 10));
    const visibles = selectLivePins(muchos, AHORA);

    // p0 es el más nuevo (0 s) y pN el más viejo. Los descartados deben ser los
    // dos últimos.
    expect(visibles[0]?.id).toBe('p0');
    expect(visibles.map((p) => p.id)).not.toContain(`p${MAX_LIVE_PINS + 1}`);
  });

  it('sin códigos devuelve una lista vacía, no falla', () => {
    expect(selectLivePins([], AHORA)).toEqual([]);
  });
});
