import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de la firma del webhook de correo entrante.
 *
 * El endpoint es público por necesidad: el proveedor tiene que poder llamarlo.
 * Sin verificación, cualquiera podría inyectar PIN falsos con un `curl` y hacer
 * que un cliente introdujera un código controlado por un atacante.
 *
 * Tres detalles que son la diferencia entre verificar de verdad y aparentarlo:
 *
 * 1. **Se firma el cuerpo CRUDO**, no el JSON re-serializado. `JSON.parse` +
 *    `JSON.stringify` no conserva el orden de claves ni el espaciado, así que la
 *    firma calculada no coincidiría con la del proveedor.
 *
 * 2. **`timingSafeEqual` en lugar de `===`.** Una comparación de strings termina
 *    en el primer byte distinto, y ese tiempo de ejecución permite reconstruir
 *    una firma válida byte a byte. Es un ataque práctico, no teórico.
 *
 * 3. **Ventana temporal.** Sin comprobar el timestamp, un webhook capturado
 *    puede reproducirse indefinidamente.
 */

const MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutos

export type SignatureVerification =
  | { valid: true }
  | { valid: false; reason: 'missing_signature' | 'invalid_signature' | 'stale_timestamp' };

export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  now?: Date;
}): SignatureVerification {
  const { rawBody, signature, timestamp, secret, now = new Date() } = params;

  if (!signature) {
    return { valid: false, reason: 'missing_signature' };
  }

  // El timestamp es opcional en algunos proveedores. Cuando llega, se exige que
  // sea reciente; cuando no, se acepta la firma sin protección contra replay,
  // que es lo máximo que se puede garantizar con ese proveedor.
  if (timestamp) {
    const timestampSeconds = Number.parseInt(timestamp, 10);
    if (Number.isNaN(timestampSeconds)) {
      return { valid: false, reason: 'stale_timestamp' };
    }

    const skew = Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds);
    if (skew > MAX_CLOCK_SKEW_SECONDS) {
      return { valid: false, reason: 'stale_timestamp' };
    }
  }

  // El timestamp entra en el mensaje firmado: si no, un atacante podría cambiarlo
  // libremente y la protección contra replay no valdría nada.
  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  const provided = signature.replace(/^sha256=/, '').trim();

  // `timingSafeEqual` lanza si las longitudes difieren, lo que en sí mismo
  // filtraría información. Se comprueba antes y se devuelve el mismo error.
  if (provided.length !== expected.length) {
    return { valid: false, reason: 'invalid_signature' };
  }

  const isValid = timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));

  return isValid ? { valid: true } : { valid: false, reason: 'invalid_signature' };
}

/** Utilidad para firmar payloads en pruebas locales (`scripts/sign-payload.mjs`). */
export function signPayload(rawBody: string, secret: string, timestamp?: string): string {
  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  return createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
}
