import 'server-only';

import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from 'node:crypto';

/**
 * Web Push (RFC 8030 · 8291 · 8292) sin dependencias.
 *
 * Se implementa a mano en lugar de instalar `web-push` por el mismo motivo que
 * el Worker firma su HMAC a mano: son cien líneas de estándar bien especificado,
 * y una dependencia menos en el camino de un aviso que tiene que funcionar
 * cuando un cliente ya pagó y está esperando.
 *
 * El protocolo tiene dos mitades independientes que conviene no mezclar:
 *
 *   · **VAPID** (RFC 8292) identifica al servidor ante el servicio de push del
 *     navegador. Es un JWT firmado con ES256 que viaja en `Authorization`.
 *   · **El cifrado del contenido** (RFC 8291, `aes128gcm`) protege el mensaje de
 *     punta a punta: ni Google ni Apple pueden leerlo, sólo el navegador que se
 *     suscribió. Por eso la suscripción trae dos claves además de la URL.
 *
 * El fallo más habitual al implementarlo es la firma: Node devuelve ECDSA en
 * formato DER y el JWT exige los dos enteros crudos concatenados. Se resuelve
 * con `dsaEncoding: 'ieee-p1363'`, y sin eso el servicio de push responde 401
 * sin más explicación.
 */

/** Suscripción tal y como la entrega `PushSubscription.toJSON()` en el navegador. */
export interface PushSubscriptionRecord {
  endpoint: string;
  /** Clave pública del navegador: punto P-256 sin comprimir, en base64url. */
  p256dh: string;
  /** Secreto de autenticación de 16 bytes, en base64url. */
  auth: string;
}

export interface VapidKeys {
  /** Punto P-256 sin comprimir (65 bytes) en base64url. */
  publicKey: string;
  /** Escalar privado (32 bytes) en base64url. */
  privateKey: string;
  /** `mailto:` o URL de contacto, obligatorio por RFC 8292. */
  subject: string;
}

export type PushResult =
  | { status: 'sent' }
  /** 404 o 410: el navegador desinstaló la app o revocó el permiso. Hay que borrar la fila. */
  | { status: 'gone' }
  | { status: 'failed'; message: string };

// -----------------------------------------------------------------------------
// base64url
// -----------------------------------------------------------------------------

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

// -----------------------------------------------------------------------------
// HKDF (RFC 5869), en su forma corta
// -----------------------------------------------------------------------------
// Todas las derivaciones de Web Push piden como mucho 32 bytes, así que basta
// con una única ronda de expansión: el contador final es siempre 0x01.
// -----------------------------------------------------------------------------

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, longitud: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const okm = createHmac('sha256', prk).update(info).update(Buffer.of(0x01)).digest();
  return okm.subarray(0, longitud);
}

// -----------------------------------------------------------------------------
// VAPID
// -----------------------------------------------------------------------------

/**
 * Reconstruye la clave privada en formato JWK.
 *
 * Las claves de VAPID se distribuyen como dos cadenas base64url —el escalar
 * privado y el punto público— porque es el formato que genera todo el mundo y
 * el que se pega en las variables de entorno. Node necesita un JWK completo, y
 * las coordenadas salen de partir el punto público: `0x04 || x(32) || y(32)`.
 */
function privateKeyFrom(keys: VapidKeys) {
  const publicKey = fromB64url(keys.publicKey);

  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY no es un punto P-256 sin comprimir de 65 bytes');
  }

  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(publicKey.subarray(1, 33)),
      y: b64url(publicKey.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/** JWT ES256 con el origen del endpoint como audiencia. */
function vapidHeader(endpoint: string, keys: VapidKeys): string {
  const audiencia = new URL(endpoint).origin;

  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audiencia,
        // Doce horas. El RFC permite hasta veinticuatro; la mitad deja margen
        // para un reloj desajustado sin obligar a firmar en cada envío.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  );

  const firmado = `${header}.${payload}`;

  // `ieee-p1363` produce r||s crudos. Con el DER por defecto de Node el
  // servicio de push responde 401 sin decir por qué.
  const firma = sign('sha256', Buffer.from(firmado), {
    key: privateKeyFrom(keys),
    dsaEncoding: 'ieee-p1363',
  });

  return `vapid t=${firmado}.${b64url(firma)}, k=${keys.publicKey}`;
}

// -----------------------------------------------------------------------------
// Cifrado del contenido (RFC 8291, aes128gcm)
// -----------------------------------------------------------------------------

/**
 * Cifra el mensaje para una suscripción concreta.
 *
 * Exportada para poder probarla contra los vectores del RFC: el cifrado es la
 * parte que falla en silencio —el navegador descarta el mensaje sin avisar a
 * nadie— y comprobarla con datos conocidos es la única forma de saber que está
 * bien antes de depender de ella.
 */
export function encryptPayload(
  texto: string,
  suscripcion: Pick<PushSubscriptionRecord, 'p256dh' | 'auth'>,
  /** Inyectables sólo para los tests; en producción son aleatorios. */
  semilla?: { salt: Buffer; serverPrivateKey: Buffer },
): Buffer {
  const clientePublico = fromB64url(suscripcion.p256dh);
  const authSecret = fromB64url(suscripcion.auth);

  const ecdh = createECDH('prime256v1');

  if (semilla) {
    ecdh.setPrivateKey(semilla.serverPrivateKey);
  } else {
    ecdh.generateKeys();
  }

  const servidorPublico = ecdh.getPublicKey();
  const compartido = ecdh.computeSecret(clientePublico);

  // El secreto compartido se mezcla primero con el `auth` de la suscripción.
  // Este paso es lo que ata el mensaje a ese navegador concreto: sin el `auth`,
  // cualquiera que interceptara las claves públicas podría descifrarlo.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    clientePublico,
    servidorPublico,
  ]);
  const ikm = hkdf(authSecret, compartido, keyInfo, 32);

  const salt = semilla?.salt ?? randomBytes(16);

  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // 0x02 marca el final del último (y único) registro. Sin ese byte el
  // navegador rechaza la carga por malformada.
  const conRelleno = Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.of(0x02)]);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const cifrado = Buffer.concat([cipher.update(conRelleno), cipher.final(), cipher.getAuthTag()]);

  // Cabecera del cuerpo: salt(16) | tamaño de registro(4) | longitud de la
  // clave(1) | clave pública del servidor(65) | contenido cifrado.
  const tamanoRegistro = Buffer.alloc(4);
  tamanoRegistro.writeUInt32BE(4096, 0);

  return Buffer.concat([
    salt,
    tamanoRegistro,
    Buffer.of(servidorPublico.length),
    servidorPublico,
    cifrado,
  ]);
}

// -----------------------------------------------------------------------------
// Envío
// -----------------------------------------------------------------------------

/**
 * Entrega una notificación a una suscripción.
 *
 * Nunca lanza: un aviso que falla no debe tumbar la operación que lo provocó
 * —el pedido del cliente ya está guardado— y el estado `gone` es información
 * accionable, no un error: significa que hay que borrar esa fila.
 */
export async function sendPush(
  suscripcion: PushSubscriptionRecord,
  payload: unknown,
  keys: VapidKeys,
  /** Segundos que el servicio guarda el aviso si el teléfono está apagado. */
  ttlSegundos = 4 * 60 * 60,
): Promise<PushResult> {
  try {
    const cuerpo = encryptPayload(JSON.stringify(payload), suscripcion);

    const respuesta = await fetch(suscripcion.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(suscripcion.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSegundos),
        Urgency: 'high',
      },
      body: new Uint8Array(cuerpo),
    });

    if (respuesta.ok) return { status: 'sent' };

    // 404: la suscripción nunca existió. 410: el navegador la revocó, que es lo
    // que pasa al desinstalar la aplicación o limpiar los datos del sitio.
    if (respuesta.status === 404 || respuesta.status === 410) {
      return { status: 'gone' };
    }

    return {
      status: 'failed',
      message: `El servicio de push respondió ${respuesta.status}`,
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
