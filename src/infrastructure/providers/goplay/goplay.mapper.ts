import type { ProviderEmail } from '@/core/ports/code-provider';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';

/**
 * Traducción de la respuesta de GoPlay a correos crudos.
 *
 * Se mantiene como función **pura** y separada del cliente HTTP por la misma
 * razón que los parsers: así cada respuesta rara que aparezca en producción se
 * convierte en un caso de regresión de tres líneas, sin red de por medio.
 *
 * La forma real está documentada en `docs/12-codigos-de-goplay.md`. Los tres
 * detalles que cuestan un ciclo de depuración si se olvidan:
 *
 * 1. **GoPlay responde HTTP 200 aunque falle.** El éxito se decide por el campo
 *    `success`, nunca por el código de estado.
 * 2. **`response` es JSON serializado dentro de un string.** Hay que hacer
 *    `JSON.parse` dos veces. Dentro viaja la respuesta cruda de Zoho Mail, que
 *    es quien les hospeda el buzón.
 * 3. **`toAddress` viene escapado como HTML** (`&lt;alguien@dominio&gt;`).
 */

/** Mensaje con el que GoPlay contesta cuando todavía no hay ningún correo. */
export const MENSAJE_SIN_CODIGO = 'No se pudo obtener el código del correo.';

interface SobreGoPlay {
  readonly success?: unknown;
  readonly msg?: unknown;
  readonly response?: unknown;
}

interface CorreoZoho {
  readonly messageId?: unknown;
  readonly subject?: unknown;
  readonly summary?: unknown;
  readonly html?: unknown;
  readonly fromAddress?: unknown;
  readonly toAddress?: unknown;
  readonly receivedTime?: unknown;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const texto = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Deshace el escapado HTML y se queda con la dirección de dentro de los <>. */
function direccion(v: unknown): string {
  const crudo = texto(v);
  if (!crudo) return '';

  const limpio = crudo
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim();

  return limpio.match(/<([^>]+)>/)?.[1]?.trim() ?? limpio;
}

/**
 * Convierte el epoch en milisegundos que manda Zoho —como string— en Date.
 *
 * Ante un valor ausente o ilegible se devuelve `null` y el correo se descarta.
 * Es deliberado: inventar `new Date()` aquí colaría correos del inquilino
 * anterior dentro de la ventana del actual (ver `ProviderEmail.receivedAt`).
 */
function recibidoEn(v: unknown): Date | null {
  const crudo = typeof v === 'number' ? String(v) : texto(v);
  if (!crudo || !/^\d{10,16}$/.test(crudo)) return null;

  const fecha = new Date(Number.parseInt(crudo, 10));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function mapGoPlayResponse(body: unknown): Result<readonly ProviderEmail[], DomainError> {
  if (!esObjeto(body)) {
    return err(DomainError.parseFailed('GoPlay devolvió algo que no es un objeto JSON'));
  }

  const sobre = body as SobreGoPlay;

  // Lista vacía, no error: es la respuesta normal mientras el correo no llega.
  // GoPlay no distingue "todavía no hay nada" de un fallo suyo —usa el mismo
  // mensaje para ambos—, así que aquí tampoco se puede distinguir. El mensaje se
  // conserva en el log del cliente para cuando haya que investigar.
  if (sobre.success !== true) return ok([]);

  const crudo = texto(sobre.response);
  if (!crudo) {
    return err(
      DomainError.parseFailed('GoPlay dijo que había correo pero no envió el campo `response`'),
    );
  }

  let interno: unknown;
  try {
    interno = JSON.parse(crudo);
  } catch {
    return err(DomainError.parseFailed('El campo `response` de GoPlay no es JSON válido'));
  }

  if (!esObjeto(interno) || !Array.isArray(interno.items)) {
    return err(DomainError.parseFailed('La respuesta de GoPlay no trae la lista `items`'));
  }

  const correos: ProviderEmail[] = [];

  for (const bruto of interno.items) {
    if (!esObjeto(bruto)) continue;

    const item = bruto as CorreoZoho;
    const messageId = texto(item.messageId);
    const receivedAt = recibidoEn(item.receivedTime);
    const html = texto(item.html);
    const summary = texto(item.summary);

    // Sin identificador no hay idempotencia posible y sin fecha no se puede
    // decidir a quién pertenece el correo: en ambos casos es mejor descartarlo
    // que arriesgar un PIN mal atribuido.
    if (!messageId || !receivedAt) continue;
    if (!html && !summary) continue;

    correos.push({
      messageId,
      receivedAt,
      from: texto(item.fromAddress) ?? '',
      to: direccion(item.toAddress),
      subject: texto(item.subject) ?? '',
      // El `summary` de Zoho es el texto de vista previa. Se pasa como `text`
      // para que el parser lo tenga como segundo intento, pero el bueno es el
      // `html`: en el resumen el código va incrustado en la frase y ninguna
      // regla lo saca (ver docs/12).
      text: summary,
      html,
    });
  }

  return ok(correos);
}
