import { NextResponse, type NextRequest } from 'next/server';

import { normalizeInboundEmail } from '@/infrastructure/email/providers/normalize-payload';
import { verifyWebhookSignature } from '@/infrastructure/email/providers/webhook-verification';
import { makeProcessInboundEmailUseCase } from '@/infrastructure/container';
import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Webhook de correo entrante — la entrada del pipeline completo.
 *
 * Es un Route Handler y no una Server Action porque el consumidor es una máquina
 * sin sesión: necesita un endpoint HTTP estable, su propio esquema de
 * autenticación (firma HMAC) y control explícito del código de estado. Ver
 * docs/adr/0005.
 *
 * `runtime = 'nodejs'` es obligatorio: el runtime Edge no ofrece
 * `node:crypto.timingSafeEqual`, que es lo que hace que la verificación de la
 * firma sea resistente a ataques de temporización.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Código de estado por desenlace. La distinción no es cosmética: determina si el
 * proveedor de correo reintenta.
 *
 *   200 → "recibido, no vuelvas a enviarlo"
 *   401 → firma inválida, descartar
 *   500 → "algo falló por nuestra parte, reintenta"
 *
 * Devolver 4xx ante un correo que nunca va a casar (buzón inexistente) haría que
 * el proveedor reintentara indefinidamente; devolver 200 ante un fallo real de
 * base de datos perdería el PIN de forma definitiva.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
  const limit = rateLimit(`inbound-email:${ip}`, 120, 60_000);

  if (!limit.allowed) {
    logger.warn('Webhook de correo limitado por tasa', { ip });
    return NextResponse.json(
      { status: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  // El cuerpo se lee CRUDO. Firmar el JSON re-serializado no funcionaría:
  // `JSON.parse` + `JSON.stringify` no conserva el orden de claves ni el
  // espaciado, así que el HMAC calculado no coincidiría con el del proveedor.
  const rawBody = await request.text();

  const verification = verifyWebhookSignature({
    rawBody,
    signature:
      request.headers.get('x-streamclick-signature') ?? request.headers.get('svix-signature'),
    timestamp:
      request.headers.get('x-streamclick-timestamp') ?? request.headers.get('svix-timestamp'),
    secret: env.INBOUND_EMAIL_WEBHOOK_SECRET,
  });

  if (!verification.valid) {
    // Sin esta comprobación, cualquiera podría inyectar PIN falsos con un `curl`
    // y hacer que un cliente introdujera un código controlado por un atacante.
    logger.warn('Firma de webhook rechazada', { ip, reason: verification.reason });
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // JSON malformado con firma válida no se va a arreglar reintentando: 400.
    return NextResponse.json({ status: 'invalid_json' }, { status: 400 });
  }

  const normalized = normalizeInboundEmail(payload);
  if (!normalized.ok) {
    logger.warn('Payload de correo no reconocido', { error: normalized.error });
    return NextResponse.json({ status: 'invalid_payload', error: normalized.error }, { status: 400 });
  }

  const useCase = makeProcessInboundEmailUseCase();
  const result = await useCase.execute(normalized.value);

  if (!result.ok) {
    // Único caso de 500: un fallo de infraestructura. El proveedor reintentará y
    // la idempotencia por `message_id` hace que ese reintento sea seguro.
    logger.error('Fallo al procesar el correo entrante', {
      messageId: normalized.value.messageId,
      error: result.error.message,
    });
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }

  // Se devuelve el desenlace pero NUNCA el código extraído: los logs del
  // proveedor de correo son un tercero, y un PIN filtrado ahí sigue siendo
  // válido durante 15 minutos.
  return NextResponse.json({
    status: result.value.status,
    pinId: result.value.pinId ?? null,
  });
}

/** Algunos proveedores hacen un GET de verificación al configurar el endpoint. */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok', endpoint: 'inbound-email' });
}
