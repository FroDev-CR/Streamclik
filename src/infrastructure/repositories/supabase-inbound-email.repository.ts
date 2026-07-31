import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  InboundEmailRepository,
  IngestEmailInput,
  IngestEmailOutcome,
} from '@/core/ports/repositories';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';
import type { Database, Json } from '@/infrastructure/supabase/database.types';

/**
 * Implementación de `InboundEmailRepository` sobre Supabase.
 *
 * Delega en el RPC `ingest_inbound_email`, que resuelve la cuenta, registra el
 * correo, crea el PIN y encola las notificaciones en **una sola transacción**.
 * Hacerlo con tres llamadas desde aquí no compartiría transacción, y un fallo
 * intermedio dejaría el correo registrado sin PIN.
 *
 * Requiere el cliente administrativo: el webhook no tiene sesión de usuario y la
 * función está revocada para los roles públicos.
 */
export class SupabaseInboundEmailRepository implements InboundEmailRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async ingest(input: IngestEmailInput): Promise<Result<IngestEmailOutcome, DomainError>> {
    const { data, error } = await this.client.rpc('ingest_inbound_email', {
      p_message_id: input.messageId,
      p_to_address: input.toAddress,
      p_from_address: input.fromAddress,
      p_subject: input.subject,
      p_body_text: input.bodyText,
      p_body_html: input.bodyHtml,
      p_raw_payload: (input.rawPayload ?? null) as Json,
      p_received_at: input.receivedAt.toISOString(),
      p_code: input.code,
      p_code_type: input.codeType,
      p_action_url: input.actionUrl,
      p_parse_status: input.parseStatus,
      p_parse_error: input.parseError,
    });

    if (error) {
      // Se devuelve INFRASTRUCTURE_ERROR a propósito: es el único código que hace
      // que el webhook responda 500 y el proveedor de correo reintente. La
      // idempotencia por `message_id` hace que ese reintento sea seguro.
      return err(DomainError.infrastructure(`Fallo del RPC de ingesta: ${error.message}`, error));
    }

    const outcome = data as unknown as { status?: string } | null;

    if (!outcome?.status) {
      return err(DomainError.infrastructure('El RPC de ingesta devolvió una respuesta inesperada'));
    }

    return ok({
      status: outcome.status as IngestEmailOutcome['status'],
      inboundEmailId: (outcome as Record<string, string>).inbound_email_id,
      pinId: (outcome as Record<string, string>).pin_id,
      accountId: (outcome as Record<string, string>).account_id,
      queuedNotifications: (outcome as Record<string, number>).queued_notifications,
    });
  }
}
