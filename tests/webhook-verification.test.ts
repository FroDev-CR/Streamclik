import { describe, expect, it } from 'vitest';

import {
  signPayload,
  verifyWebhookSignature,
} from '@/infrastructure/email/providers/webhook-verification';

/**
 * Tests de la verificación de firma del webhook.
 *
 * Es la única barrera entre un endpoint público y la escritura de PIN en la base
 * de datos: sin ella, cualquiera podría inyectar códigos falsos con un `curl` y
 * hacer que un cliente introdujera un código controlado por un atacante.
 */

const SECRET = 'un-secreto-de-pruebas-con-longitud-suficiente';
const BODY = '{"messageId":"abc","to":"netflix1@streamclick.com"}';

describe('verifyWebhookSignature', () => {
  it('acepta una firma correcta sin timestamp', () => {
    const signature = signPayload(BODY, SECRET);

    expect(
      verifyWebhookSignature({ rawBody: BODY, signature, timestamp: null, secret: SECRET }),
    ).toEqual({ valid: true });
  });

  it('acepta una firma correcta con timestamp reciente', () => {
    const now = new Date('2026-07-31T10:00:00Z');
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const signature = signPayload(BODY, SECRET, timestamp);

    expect(
      verifyWebhookSignature({ rawBody: BODY, signature, timestamp, secret: SECRET, now }),
    ).toEqual({ valid: true });
  });

  it('admite el prefijo sha256=', () => {
    const signature = `sha256=${signPayload(BODY, SECRET)}`;

    expect(
      verifyWebhookSignature({ rawBody: BODY, signature, timestamp: null, secret: SECRET }).valid,
    ).toBe(true);
  });

  it('rechaza la petición sin firma', () => {
    const result = verifyWebhookSignature({
      rawBody: BODY,
      signature: null,
      timestamp: null,
      secret: SECRET,
    });

    expect(result).toEqual({ valid: false, reason: 'missing_signature' });
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const signature = signPayload(BODY, 'secreto-equivocado');

    expect(
      verifyWebhookSignature({ rawBody: BODY, signature, timestamp: null, secret: SECRET }),
    ).toEqual({ valid: false, reason: 'invalid_signature' });
  });

  it('rechaza un cuerpo alterado tras firmar', () => {
    // El escenario que importa: un atacante intercepta el webhook y cambia el
    // código por otro que él controla.
    const signature = signPayload(BODY, SECRET);
    const tampered = BODY.replace('abc', 'xyz');

    expect(
      verifyWebhookSignature({ rawBody: tampered, signature, timestamp: null, secret: SECRET })
        .valid,
    ).toBe(false);
  });

  it('rechaza un webhook reproducido fuera de la ventana temporal', () => {
    const signedAt = new Date('2026-07-31T10:00:00Z');
    const timestamp = String(Math.floor(signedAt.getTime() / 1000));
    const signature = signPayload(BODY, SECRET, timestamp);

    // Diez minutos después: la firma sigue siendo criptográficamente válida,
    // pero reproducirla ya no debe funcionar.
    const replayedAt = new Date('2026-07-31T10:10:00Z');

    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signature,
        timestamp,
        secret: SECRET,
        now: replayedAt,
      }),
    ).toEqual({ valid: false, reason: 'stale_timestamp' });
  });

  it('rechaza una firma de longitud distinta sin lanzar', () => {
    // `timingSafeEqual` lanza si las longitudes difieren; la comprobación previa
    // evita que una firma corta tumbe el endpoint con un error 500.
    expect(() =>
      verifyWebhookSignature({
        rawBody: BODY,
        signature: 'demasiado-corta',
        timestamp: null,
        secret: SECRET,
      }),
    ).not.toThrow();
  });
});
