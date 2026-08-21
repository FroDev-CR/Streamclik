import type { RawEmail } from './email-parser';
import type { DomainError } from '@/core/shared/errors';
import type { Result } from '@/core/shared/result';

/**
 * Puerto de proveedores de código.
 *
 * Existe porque no todas las cuentas que vendemos tienen su correo en nuestro
 * buzón. Las de Disney+ las compramos a GoPlay, que conserva el buzón y expone
 * los correos a través de su propia API: el código no llega solo, hay que ir a
 * pedirlo.
 *
 * Esa es la diferencia de fondo con `EmailParser`, y conviene tenerla clara
 * antes de tocar nada aquí:
 *
 * - El pipeline de correo es **push**: Netflix escribe, el Worker empuja, el
 *   webhook procesa. Nadie pregunta nada.
 * - Un proveedor de códigos es **pull**: alguien —el cliente desde su pantalla—
 *   pregunta, y la respuesta llega en el momento.
 *
 * Lo que NO cambia es todo lo demás. Un proveedor devuelve correos crudos con la
 * misma forma que los del webhook, así que los parsers que ya existen sirven sin
 * tocarlos: GoPlay es un **transporte nuevo, no un parser nuevo**. Si algún día
 * alguien se pone a escribir un `GoPlayParser`, se ha equivocado de capa.
 */

export interface ProviderEmail extends RawEmail {
  /**
   * Identificador estable del correo en el proveedor. Es la clave de
   * idempotencia: el mismo correo consultado tres veces seguidas —cosa que pasa,
   * porque el cliente pulsa el botón varias veces mientras espera— debe producir
   * un solo PIN en la base de datos.
   */
  readonly messageId: string;

  /**
   * Momento de recepción según el proveedor, no el momento de la consulta.
   *
   * Importa para la privacidad, no para el adorno: RLS sólo deja ver los PIN
   * cuya `received_at` cae dentro de la ventana de la asignación
   * (`can_view_pin()`). Si aquí pusiéramos `new Date()`, un correo viejo del
   * inquilino anterior entraría con fecha de hoy y sería visible para el
   * inquilino actual.
   */
  readonly receivedAt: Date;
}

export interface CodeProvider {
  /** Identifica al proveedor en la base de datos y en los logs. */
  readonly slug: string;

  /**
   * Pide al proveedor los correos recientes de un perfil.
   *
   * Devolver una lista vacía es un resultado **legítimo y frecuente**: significa
   * que todavía no ha llegado ningún correo. No es un error y no debe tratarse
   * como tal — el cliente acaba de pulsar el botón y el correo puede tardar unos
   * segundos.
   */
  fetchEmails(providerProfileId: string): Promise<Result<readonly ProviderEmail[], DomainError>>;
}
