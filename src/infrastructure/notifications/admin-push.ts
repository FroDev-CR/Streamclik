import 'server-only';

import { createSupabaseAdminClient } from '@/infrastructure/supabase/admin';
import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { sendPush, type VapidKeys } from '@/lib/web-push';

/**
 * Avisar al operador de que entró un pago.
 *
 * Es la pieza que cierra el flujo de compra: el cliente sube su comprobante y
 * queda esperando a que alguien lo mire. Sin aviso, ese «alguien» tiene que
 * acordarse de abrir el panel, y el cliente espera de más por nada.
 *
 * ⚠️ Usa el cliente administrativo, que **omite RLS**, y es correcto que lo
 * haga: quien dispara esto es el cliente que acaba de pagar, y sus políticas le
 * impiden —por diseño— leer las suscripciones push del operador. No hay ninguna
 * sesión en juego que pueda autorizar esa lectura, porque el destinatario del
 * aviso es justamente otra persona.
 *
 * Nada aquí lanza. El pedido del cliente ya está guardado cuando se llama a esta
 * función; que falle un aviso no puede deshacer una compra ni mostrarle un error
 * a quien no tiene nada que arreglar.
 */

export interface AvisoPago {
  titulo: string;
  cuerpo: string;
  /** Ruta a la que lleva el toque en la notificación. */
  url?: string;
}

function leerClavesVapid(): VapidKeys | null {
  const env = getServerEnv();

  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;

  return {
    publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

/** ¿Están configuradas las claves? Lo consulta la pantalla antes de ofrecer el botón. */
export function hayPushConfigurado(): boolean {
  return leerClavesVapid() !== null;
}

export async function notificarAdminsDePago(aviso: AvisoPago): Promise<void> {
  const keys = leerClavesVapid();

  // Sin claves configuradas no es un error: es una instalación que todavía no
  // activó los avisos. Se registra en nivel informativo y se sigue.
  if (!keys) {
    logger.info('Aviso de pago omitido: faltan las claves VAPID');
    return;
  }

  const supabase = createSupabaseAdminClient();

  const { data: admins, error: errorAdmins } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('role', 'admin');

  if (errorAdmins || !admins?.length) {
    if (errorAdmins) {
      logger.error('No se pudo leer la lista de administradores', {
        error: errorAdmins.message,
      });
    }
    return;
  }

  const { data: suscripciones, error: errorSubs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in(
      'user_id',
      admins.map((admin) => admin.id),
    );

  if (errorSubs) {
    logger.error('No se pudieron leer las suscripciones push', { error: errorSubs.message });
    return;
  }

  if (!suscripciones?.length) {
    logger.info('Aviso de pago omitido: ningún administrador tiene avisos activados');
    return;
  }

  const resultados = await Promise.all(
    suscripciones.map(async (suscripcion) => {
      const resultado = await sendPush(
        {
          endpoint: suscripcion.endpoint,
          p256dh: suscripcion.p256dh,
          auth: suscripcion.auth,
        },
        {
          titulo: aviso.titulo,
          cuerpo: aviso.cuerpo,
          url: aviso.url ?? '/admin/pagos',
          etiqueta: 'pago-pendiente',
        },
        keys,
      );

      return { id: suscripcion.id, resultado };
    }),
  );

  // Las suscripciones muertas se borran en cuanto el servicio de push lo dice.
  // Si no, cada pago reintentaría contra el teléfono de un navegador que ya
  // desinstaló la aplicación, y el log se llenaría de fallos que no lo son.
  const caducadas = resultados
    .filter((fila) => fila.resultado.status === 'gone')
    .map((fila) => fila.id);

  if (caducadas.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', caducadas);
    logger.info('Suscripciones push caducadas eliminadas', { total: caducadas.length });
  }

  for (const fila of resultados) {
    if (fila.resultado.status === 'failed') {
      logger.warn('No se pudo entregar un aviso de pago', {
        subscriptionId: fila.id,
        error: fila.resultado.message,
      });
    }
  }
}
