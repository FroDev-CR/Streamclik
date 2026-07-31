/**
 * StreamClick — Email Worker de Cloudflare
 *
 * Es el eslabón que conecta el correo real con la aplicación: Cloudflare Email
 * Routing entrega aquí todo lo que llegue a *@streamclick.xyz, este Worker
 * convierte el MIME en JSON, lo firma y lo envía al webhook de la app.
 *
 * Por qué Cloudflare y no un proveedor de inbound email de pago:
 *
 *   · El catch-all (`*@streamclick.xyz`) permite crear netflix1@, netflix2@,
 *     disney1@… sin configurar nada nuevo por cada cuenta. Con un proveedor
 *     tradicional habría que dar de alta cada dirección a mano, y el operador
 *     acabaría olvidándolo justo cuando compre una cuenta nueva.
 *   · Es gratuito y sin límite práctico de mensajes.
 *   · El dominio ya necesita DNS en algún sitio; hacerlo aquí evita un
 *     proveedor más que administrar.
 *
 * El Worker NO extrae el código. Esa lógica vive en la aplicación
 * (src/infrastructure/email/parsers/), donde está testeada y donde se puede
 * corregir sin desplegar dos sistemas distintos. Aquí sólo se traduce y se firma.
 */

import PostalMime from 'postal-mime';

/**
 * Firma HMAC-SHA256 en hexadecimal usando Web Crypto.
 *
 * Debe producir exactamente el mismo resultado que
 * `src/infrastructure/email/providers/webhook-verification.ts`, que firma
 * `${timestamp}.${cuerpo}`. Si los dos lados no coinciden byte a byte, el
 * webhook responde 401 y ningún código llega jamás.
 */
async function hmacSha256Hex(secret, payload) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Identificador estable del mensaje, base de la idempotencia.
 *
 * La cabecera `Message-ID` es la fuente correcta: si Cloudflare reintenta la
 * entrega, llega el mismo valor y el RPC de ingesta descarta el duplicado por su
 * restricción UNIQUE. Sólo si falta se recurre a un compuesto, que es peor pero
 * evita quedarse sin clave.
 */
function resolveMessageId(message, parsed) {
  const header = message.headers.get('message-id') ?? parsed.messageId;

  if (header) return header.replace(/^<|>$/g, '').trim();

  return `${message.to}:${parsed.subject ?? ''}:${new Date().toISOString().slice(0, 16)}`;
}

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {{ WEBHOOK_URL: string, INBOUND_EMAIL_WEBHOOK_SECRET: string, FORWARD_TO?: string }} env
   */
  async email(message, env) {
    if (!env.INBOUND_EMAIL_WEBHOOK_SECRET || !env.WEBHOOK_URL) {
      // Se lanza en lugar de descartar en silencio: un Worker mal configurado
      // debe ser ruidoso, porque el síntoma alternativo ("no llegan los
      // códigos") es indistinguible de un fallo de Netflix.
      throw new Error('Faltan WEBHOOK_URL o INBOUND_EMAIL_WEBHOOK_SECRET en el Worker');
    }

    const parsed = await PostalMime.parse(message.raw);

    const payload = {
      messageId: resolveMessageId(message, parsed),
      to: message.to,
      from: message.from,
      subject: parsed.subject ?? '',
      text: parsed.text ?? null,
      html: parsed.html ?? null,
      receivedAt: new Date().toISOString(),
    };

    // El cuerpo se serializa UNA sola vez y se firma y se envía exactamente esa
    // misma cadena. Serializar dos veces (una para firmar y otra para enviar) es
    // el error clásico: `JSON.stringify` no garantiza un resultado idéntico, y
    // la firma dejaría de cuadrar de forma intermitente.
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacSha256Hex(env.INBOUND_EMAIL_WEBHOOK_SECRET, `${timestamp}.${body}`);

    const response = await fetch(env.WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-streamclick-timestamp': timestamp,
        'x-streamclick-signature': signature,
      },
      body,
    });

    const outcome = await response.text();

    if (response.ok) {
      // No se registra el cuerpo del correo ni el código: los logs de Cloudflare
      // son visibles para todo el equipo y un PIN filtrado sigue siendo válido
      // durante 15 minutos.
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'Correo entregado al webhook',
          to: message.to,
          status: response.status,
          outcome,
        }),
      );
      return;
    }

    console.error(
      JSON.stringify({
        level: 'error',
        message: 'El webhook rechazó el correo',
        to: message.to,
        status: response.status,
        outcome,
      }),
    );

    // Red de seguridad opcional: si la aplicación está caída, el correo se
    // reenvía a un buzón real para poder leer el código a mano en vez de
    // perderlo. Sin esto, una caída de Vercel significa clientes sin acceso.
    if (env.FORWARD_TO) {
      await message.forward(env.FORWARD_TO);
    }

    // Lanzar hace que Cloudflare reintente la entrega. Es seguro: la ingesta es
    // idempotente por `Message-ID`, así que un reintento no duplica el PIN.
    throw new Error(`El webhook respondió ${response.status}`);
  },
};
