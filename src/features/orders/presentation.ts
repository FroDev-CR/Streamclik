/**
 * Presentación de los pedidos: estados, importes y contacto.
 *
 * Módulo aparte de `queries.ts` a propósito: aquel importa `server-only` y no
 * puede cruzar a un componente de cliente. La tarjeta del historial y la lista
 * de revisión son ambas de cliente y necesitan estas etiquetas, así que viven en
 * un archivo neutro que ambos lados pueden importar —y que, al no arrastrar
 * dependencias, se puede probar sin montar medio framework.
 */

export type OrderStatus =
  'esperando_comprobante' | 'esperando_revision' | 'entregado' | 'rechazado' | 'cancelado';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

interface Presentacion {
  /** Lo que se lee en la insignia. Corto: convive con el nombre del servicio. */
  etiqueta: string;
  /** Una frase que explica qué toca ahora. Es lo que evita el correo de «¿y ahora?». */
  detalle: string;
  tono: StatusTone;
}

export const ORDER_STATUS: Record<OrderStatus, Presentacion> = {
  esperando_comprobante: {
    etiqueta: 'Falta comprobante',
    detalle: 'Adjunta la captura de tu SINPE para que podamos verificar el pago.',
    tono: 'neutral',
  },
  esperando_revision: {
    // La frase que pidió el operador, literal: es lo que el cliente ve mientras
    // espera y lo que evita que escriba preguntando si su pago llegó.
    etiqueta: 'Esperando',
    detalle: 'Comprobando pago. En cuanto lo verifiquemos te soltamos la cuenta.',
    // Azul y no ámbar: el ámbar del tema es un ocre apagado que junto al
    // amarillo de «entregado» se confundían de un vistazo, y estos dos estados
    // son precisamente los que el cliente necesita distinguir.
    tono: 'accent',
  },
  entregado: {
    etiqueta: 'Entregado',
    detalle: 'Tu perfil está activo. Lo tienes en «Mis suscripciones».',
    tono: 'success',
  },
  rechazado: {
    etiqueta: 'Rechazado',
    detalle: 'No pudimos verificar este pago. Escríbenos y lo revisamos contigo.',
    tono: 'danger',
  },
  cancelado: {
    etiqueta: 'Cancelado',
    detalle: 'Cancelaste este pedido.',
    tono: 'neutral',
  },
};

/** Precio con la moneda del pedido. Duplica a propósito lo del catálogo: aquí la moneda viene congelada en la fila. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Una moneda mal escrita en la base de datos no debe tumbar la pantalla de
    // compra: `Intl` lanza con un código que no conoce.
    return `${amount} ${currency}`;
  }
}

/**
 * Enlace de WhatsApp para escribirle al cliente desde la cola de pagos.
 *
 * Se asume Costa Rica cuando el número llega con ocho dígitos y sin prefijo, que
 * es como lo escribe prácticamente todo el mundo aquí. Un número ya
 * internacional se respeta tal cual: anteponerle 506 a un móvil español lo
 * dejaría inservible.
 */
export function whatsappLink(phone: string): string {
  const digitos = phone.replace(/\D/g, '');
  const conPrefijo = digitos.length === 8 ? `506${digitos}` : digitos;
  return `https://wa.me/${conPrefijo}`;
}
