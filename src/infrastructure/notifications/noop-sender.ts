import type { NotificationChannel } from '@/core/domain/entities';
import type { NotificationMessage, NotificationSender } from '@/core/ports/notification-sender';
import type { DomainError } from '@/core/shared/errors';
import { ok, type Result } from '@/core/shared/result';
import { logger } from '@/lib/logger';

/**
 * Canal de notificación sin efecto, sólo registra en el log.
 *
 * Es el único implementado en el MVP. Existe para que el cableado del outbox esté
 * completo y probado: cuando se implemente `TelegramSender`, lo único que cambia
 * es la clase registrada en el dispatcher.
 *
 * Se prefiere esto a dejar el hueco vacío porque un punto de extensión que nunca
 * se ha ejercitado suele no encajar cuando llega el momento de usarlo.
 */
export class NoopNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel = 'realtime';

  async isAvailableFor(): Promise<boolean> {
    return true;
  }

  async send(message: NotificationMessage): Promise<Result<void, DomainError>> {
    // El cuerpo va dentro del contexto y no interpolado en el mensaje: contiene
    // el PIN, y el redactor del logger elimina las claves sensibles antes de
    // escribir. Un código filtrado en los logs sigue siendo válido 15 minutos.
    logger.debug('Notificación no enviada (canal noop)', {
      userId: message.userId,
      title: message.title,
      channel: this.channel,
    });

    return ok(undefined);
  }
}
