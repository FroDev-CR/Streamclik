import { describe, expect, it } from 'vitest';

import { verifyWebhookSignature } from '@/infrastructure/email/providers/webhook-verification';

/**
 * Compatibilidad de firma entre el Email Worker y la aplicación.
 *
 * El Worker de Cloudflare firma con **Web Crypto** (`crypto.subtle`) porque es lo
 * único disponible en su runtime; la aplicación verifica con **node:crypto**.
 * Son dos implementaciones distintas del mismo algoritmo, y si divergen en algo
 * —la codificación del mensaje, el formato de salida, el orden de concatenación—
 * el webhook responde 401 y **ningún código llega jamás**.
 *
 * Ese fallo es especialmente caro porque no se detecta en desarrollo: los tests
 * de la app pasan, el Worker despliega sin errores, y el síntoma es simplemente
 * que los clientes no reciben nada. Este test reproduce la firma del Worker byte
 * a byte y la valida contra el verificador real.
 */

const SECRET = 'secreto-compartido-entre-cloudflare-y-vercel';

/**
 * Réplica exacta de `hmacSha256Hex()` en
 * `workers/inbound-email/src/index.js`.
 *
 * Si se cambia allí, hay que cambiarlo aquí y este test lo detectará.
 */
async function workerSign(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('firma del Email Worker', () => {
  it('produce una firma que la aplicación acepta', async () => {
    const payload = {
      messageId: '<CAF=abc123@mail.netflix.com>',
      to: 'netflix1@streamclick.xyz',
      from: 'info@account.netflix.com',
      subject: 'Tu código de acceso temporal',
      text: 'Tu código de acceso temporal es 4821',
      html: null,
      receivedAt: '2026-07-31T10:00:00.000Z',
    };

    const body = JSON.stringify(payload);
    const now = new Date('2026-07-31T10:00:05Z');
    const timestamp = String(Math.floor(now.getTime() / 1000));

    const signature = await workerSign(SECRET, `${timestamp}.${body}`);

    expect(
      verifyWebhookSignature({ rawBody: body, signature, timestamp, secret: SECRET, now }),
    ).toEqual({ valid: true });
  });

  it('sobrevive a los acentos y caracteres no ASCII del correo', async () => {
    // Los correos de Netflix en español llevan tildes y la "ñ". Si un lado
    // codificara en latin-1 y el otro en UTF-8, la firma sólo fallaría con esos
    // mensajes: exactamente los de los clientes reales, y no los de prueba.
    const body = JSON.stringify({
      subject: 'Cómo actualizar tu Hogar con Netflix — acción requerida',
      text: 'Tu código de verificación es 5502. La contraseña no cambió.',
    });

    const timestamp = '1785492000';
    const signature = await workerSign(SECRET, `${timestamp}.${body}`);

    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature,
        timestamp,
        secret: SECRET,
        now: new Date(Number(timestamp) * 1000),
      }).valid,
    ).toBe(true);
  });

  it('falla si el Worker y la aplicación usan secretos distintos', async () => {
    const body = '{"messageId":"x"}';
    const timestamp = '1785492000';

    const signature = await workerSign('secreto-del-worker', `${timestamp}.${body}`);

    // Es el error de configuración más habitual de toda la integración: el
    // secreto se genera dos veces en lugar de copiarse.
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature,
        timestamp,
        secret: 'secreto-distinto-en-vercel',
        now: new Date(Number(timestamp) * 1000),
      }),
    ).toEqual({ valid: false, reason: 'invalid_signature' });
  });
});
