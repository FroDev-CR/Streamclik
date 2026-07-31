import { z } from 'zod';

import type { ProcessInboundEmailInput } from '@/core/use-cases/process-inbound-email.use-case';

/**
 * Normalización del payload del proveedor de correo.
 *
 * Cada proveedor entrega un formato distinto. Este adaptador traduce todos ellos
 * a la entrada única del caso de uso, que así no sabe de qué proveedor procede el
 * correo.
 *
 * Merece la pena por un motivo práctico: los proveedores de correo entrante se
 * cambian con frecuencia por precio y por límites de entrega. Migrar de Resend a
 * Postmark debe ser escribir un esquema más aquí, no tocar el pipeline.
 */

/** Formato genérico, y también el que usan los fixtures de test. */
const genericSchema = z.object({
  messageId: z.string().min(1),
  to: z.string().min(1),
  from: z.string().min(1),
  subject: z.string().default(''),
  text: z.string().nullable().default(null),
  html: z.string().nullable().default(null),
  receivedAt: z.string().datetime().optional(),
});

/** Resend Inbound. */
const resendSchema = z.object({
  type: z.literal('email.received').optional(),
  data: z.object({
    email_id: z.string(),
    to: z.union([z.string(), z.array(z.string())]),
    from: z.string(),
    subject: z.string().default(''),
    text: z.string().nullable().optional(),
    html: z.string().nullable().optional(),
    created_at: z.string().optional(),
  }),
});

/** SendGrid Inbound Parse (multipart traducido a objeto). */
const sendgridSchema = z.object({
  headers: z.string().optional(),
  to: z.string(),
  from: z.string(),
  subject: z.string().default(''),
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
});

function firstRecipient(to: string | string[]): string {
  const value = Array.isArray(to) ? (to[0] ?? '') : to;
  // La cabecera puede venir con varios destinatarios separados por comas o con
  // nombre para mostrar: `"Netflix 1" <netflix1@streamclick.com>, otro@…`.
  const first = value.split(',')[0] ?? '';
  const angled = first.match(/<([^>]+)>/);
  return (angled?.[1] ?? first).trim();
}

/**
 * Extrae el `Message-ID` de las cabeceras crudas.
 *
 * Es la clave de idempotencia. Cuando el proveedor no ofrece un identificador
 * propio, se recurre a la cabecera estándar del correo, que es lo que de verdad
 * identifica el mensaje de forma estable entre reintentos.
 */
function messageIdFromHeaders(headers: string | undefined, fallback: string): string {
  if (!headers) return fallback;
  const match = headers.match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return match?.[1]?.trim() ?? fallback;
}

export type NormalizationResult =
  | { ok: true; value: ProcessInboundEmailInput }
  | { ok: false; error: string };

export function normalizeInboundEmail(payload: unknown): NormalizationResult {
  const generic = genericSchema.safeParse(payload);
  if (generic.success) {
    return {
      ok: true,
      value: {
        messageId: generic.data.messageId,
        to: firstRecipient(generic.data.to),
        from: generic.data.from,
        subject: generic.data.subject,
        text: generic.data.text,
        html: generic.data.html,
        receivedAt: generic.data.receivedAt ? new Date(generic.data.receivedAt) : new Date(),
        rawPayload: payload,
      },
    };
  }

  const resend = resendSchema.safeParse(payload);
  if (resend.success) {
    return {
      ok: true,
      value: {
        messageId: resend.data.data.email_id,
        to: firstRecipient(resend.data.data.to),
        from: resend.data.data.from,
        subject: resend.data.data.subject,
        text: resend.data.data.text ?? null,
        html: resend.data.data.html ?? null,
        receivedAt: resend.data.data.created_at
          ? new Date(resend.data.data.created_at)
          : new Date(),
        rawPayload: payload,
      },
    };
  }

  const sendgrid = sendgridSchema.safeParse(payload);
  if (sendgrid.success) {
    // Sin Message-ID no hay idempotencia posible. El compuesto
    // destinatario+asunto+minuto es un sustituto imperfecto pero suficiente:
    // los reintentos del proveedor ocurren en segundos, así que caen en la misma
    // ventana y se deduplican correctamente.
    const fallbackId = `${sendgrid.data.to}:${sendgrid.data.subject}:${new Date()
      .toISOString()
      .slice(0, 16)}`;

    return {
      ok: true,
      value: {
        messageId: messageIdFromHeaders(sendgrid.data.headers, fallbackId),
        to: firstRecipient(sendgrid.data.to),
        from: sendgrid.data.from,
        subject: sendgrid.data.subject,
        text: sendgrid.data.text ?? null,
        html: sendgrid.data.html ?? null,
        receivedAt: new Date(),
        rawPayload: payload,
      },
    };
  }

  return { ok: false, error: 'El formato del payload no coincide con ningún proveedor conocido' };
}
