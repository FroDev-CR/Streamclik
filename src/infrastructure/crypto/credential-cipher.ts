import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { getServerEnv } from '@/lib/env';

/**
 * Cifrado de las credenciales de streaming (AES-256-GCM).
 *
 * A diferencia de la contraseña de un usuario de la plataforma, estas
 * credenciales **no pueden hashearse**: el cliente necesita el valor original
 * para iniciar sesión en Netflix. Es un requisito del negocio, no una decisión
 * de diseño.
 *
 * Se elige GCM y no CBC porque GCM es *autenticado*: detecta que el texto
 * cifrado fue manipulado en lugar de descifrar silenciosamente basura.
 *
 * ⚠️ LÍMITE CONOCIDO (ver docs/adr/0007): la clave vive en la misma variable de
 * entorno que la aplicación. Esto protege frente a un volcado de la base de
 * datos, **no** frente al compromiso del entorno de ejecución. Decirlo con
 * claridad importa más que la mitigación: la trampa real sería llamar a esto
 * "cifrado seguro" y que alguien asumiera garantías que no existen. La ruta a
 * producción es Supabase Vault o un KMS externo.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits: el tamaño recomendado para GCM
const AUTH_TAG_LENGTH = 16;

export interface CredentialCipher {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

class AesGcmCredentialCipher implements CredentialCipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, 'hex');

    if (this.key.length !== 32) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY debe representar exactamente 32 bytes');
    }
  }

  /**
   * Devuelve `iv:authTag:ciphertext` en base64.
   *
   * El IV se genera aleatorio en cada cifrado y se guarda junto al resultado.
   * Reutilizar el IV en GCM es catastrófico: permite recuperar el texto plano
   * comparando dos mensajes cifrados con el mismo par clave/IV.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');

    if (parts.length !== 3) {
      throw new Error('Formato de credencial cifrada inválido');
    }

    const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Formato de credencial cifrada inválido');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    // `final()` lanza si la etiqueta de autenticación no cuadra, que es
    // exactamente el comportamiento deseado: un texto cifrado manipulado debe
    // fallar de forma ruidosa, no descifrar a basura silenciosamente.
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

let cipher: CredentialCipher | null = null;

export function getCredentialCipher(): CredentialCipher {
  if (!cipher) {
    cipher = new AesGcmCredentialCipher(getServerEnv().CREDENTIALS_ENCRYPTION_KEY);
  }
  return cipher;
}

/**
 * Descifra tolerando fallos, para uso en la UI.
 *
 * Una credencial ilegible (clave rotada, dato corrupto) no debe tumbar el
 * dashboard entero: el resto de la información de la cuenta sigue siendo útil
 * para el cliente. Se devuelve `null` y la interfaz muestra un aviso.
 */
export function tryDecrypt(payload: string): string | null {
  try {
    return getCredentialCipher().decrypt(payload);
  } catch {
    return null;
  }
}
