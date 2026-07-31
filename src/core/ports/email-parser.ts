import type { PinCodeType } from '@/core/domain/entities';

/**
 * Puerto de parsing de correo.
 *
 * Es el punto de extensión más importante del sistema: añadir Disney+ o Prime
 * Video debe consistir en implementar esta interfaz y registrarla, sin tocar el
 * webhook ni el caso de uso (principio abierto/cerrado aplicado justo donde se
 * sabe que habrá cambios).
 *
 * Los implementadores DEBEN ser funciones puras: mismo correo de entrada, mismo
 * resultado, sin I/O, sin `Date.now()`, sin aleatoriedad. De ahí viene que los
 * tests corran en milisegundos y que cada correo real que falla se convierta en
 * un caso de regresión de tres líneas.
 */

export interface RawEmail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string | null;
  readonly html: string | null;
}

export interface ParsedPin {
  readonly code: string;
  readonly codeType: PinCodeType;
  readonly actionUrl: string | null;
  /**
   * Cómo se obtuvo el código. Se persiste en los logs de diagnóstico: si un
   * patrón concreto empieza a producir códigos erróneos, este campo indica cuál
   * hay que corregir sin tener que reconstruirlo a mano.
   */
  readonly matchedPattern: string;
}

export interface EmailParser {
  /** Slug del servicio que atiende: debe coincidir con `streaming_services.slug`. */
  readonly serviceSlug: string;

  /**
   * Comprobación barata previa al parsing completo: ¿este correo procede
   * realmente del servicio? Evita que un correo promocional reenviado al buzón
   * de ingesta produzca un falso positivo.
   */
  canHandle(email: RawEmail): boolean;

  /** Devuelve `null` cuando no hay código, que es un resultado legítimo y frecuente. */
  parse(email: RawEmail): ParsedPin | null;
}
