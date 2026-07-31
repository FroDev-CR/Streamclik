import type { NotificationChannel } from '@/core/domain/entities';
import type { DomainError } from '@/core/shared/errors';
import type { Result } from '@/core/shared/result';

/**
 * Puerto de notificaciones.
 *
 * Punto de extensión para WhatsApp, Telegram y push (docs/05-integraciones-futuras.md).
 * Añadir un canal es implementar esta interfaz y registrarlo en el dispatcher: ni
 * el caso de uso de ingesta ni el pipeline de correo se modifican.
 *
 * En el MVP sólo existe `NoopNotificationSender`, que registra en el log. La
 * entrega real la hará un worker que consuma `notification_outbox`.
 */

export interface NotificationMessage {
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, string>;
}

export interface NotificationSender {
  readonly channel: NotificationChannel;

  /**
   * Un canal puede no estar disponible para un usuario concreto (sin teléfono
   * verificado, sin `telegram_chat_id`). Se comprueba antes de intentar el envío
   * para no consumir reintentos del outbox en algo que nunca podrá funcionar.
   */
  isAvailableFor(userId: string): Promise<boolean>;

  send(message: NotificationMessage): Promise<Result<void, DomainError>>;
}
