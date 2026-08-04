/**
 * Datos de contacto del operador.
 *
 * El número vive aquí y no repartido por los componentes: aparece en el botón
 * flotante, y acabará apareciendo en el pie, en los correos y en los avisos de
 * pago. Con la constante en un solo sitio, cambiar de línea es editar un fichero.
 */

/** Número de WhatsApp en formato internacional, sin `+` ni separadores. */
export const WHATSAPP_NUMERO = '50661299885';

/** Cómo se muestra a la persona, con el prefijo y los grupos habituales en CR. */
export const WHATSAPP_VISIBLE = '+506 6129 9885';

/**
 * Enlace de WhatsApp con un mensaje inicial ya escrito.
 *
 * `wa.me` y no `api.whatsapp.com`: abre la aplicación instalada en el móvil en
 * lugar de pasar antes por el navegador, que es donde ocurre la mayoría de estas
 * conversaciones.
 *
 * El texto previo no es un adorno. Sin él, el visitante abre un chat vacío y
 * tiene que inventarse cómo empezar; con él, el operador además sabe que la
 * consulta viene de la web y no de un contacto suelto.
 */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
  'Hola, vengo de StreamClick y quiero información sobre los perfiles.',
)}`;
