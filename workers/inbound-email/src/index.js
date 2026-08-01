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

/**
 * Remitente real del mensaje: la cabecera `From`, no el remitente de sobre.
 *
 * `message.from` es el **envelope sender** (el `MAIL FROM` de SMTP), y los
 * emisores masivos lo usan para gestionar rebotes: Netflix entrega sus correos
 * con algo como `010f019fbdcf0972-cd1dd5…@amazonses.com`, mientras que la
 * cabecera `From` que ve el usuario es `info@account.netflix.com`.
 *
 * La diferencia rompe el producto entero. `NetflixEmailParser.canHandle()`
 * exige que el remitente sea un dominio de Netflix —para que un correo de
 * phishing no pueda inyectar un código falso—, así que con el remitente de sobre
 * **rechazaría todos los correos legítimos** y ningún código se extraería jamás.
 * El fallo es silencioso: el correo se guarda como «sin código», que es
 * exactamente lo que se ve cuando un correo promocional no trae ninguno.
 *
 * Se detectó en producción, mirando el monitor de correos recibidos: el
 * remitente aparecía como un identificador de SES en vez de Netflix.
 */
function resolveFrom(message, parsed) {
  const cabecera = parsed.from?.address ?? message.headers.get('from');
  if (cabecera) return cabecera;

  // Sin cabecera `From` (correo malformado) queda el remitente de sobre, que al
  // menos permite registrar de dónde vino.
  return message.from;
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
      from: resolveFrom(message, parsed),
      subject: parsed.subject ?? '',
      text: parsed.text ?? null,
      html: parsed.html ?? null,
      receivedAt: new Date().toISOString(),
      // El remitente de sobre se conserva aparte para auditoría: es lo que de
      // verdad entregó el mensaje y sirve para investigar suplantaciones.
      envelopeFrom: message.from,
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
