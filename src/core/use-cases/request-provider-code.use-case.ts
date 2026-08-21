import type { CodeProvider, MotivoSinCorreo } from '@/core/ports/code-provider';
import type { Logger } from '@/core/ports/logger';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';

import type { ProcessInboundEmailUseCase } from './process-inbound-email.use-case';

/**
 * Pedir el código a un proveedor externo.
 *
 * Es deliberadamente delgado. Todo lo que viene después de tener el correo en la
 * mano —elegir parser, extraer el código, resolver la cuenta, crear el PIN,
 * encolar notificaciones— ya lo hace `ProcessInboundEmailUseCase`, que es el
 * mismo camino que recorren los correos de Netflix. Aquí sólo cambia de dónde
 * sale el correo.
 *
 * ⚠️ **El proveedor entrega cada correo una sola vez.** GoPlay lo marca como
 * leído al devolverlo y después ya no lo da. De ahí dos reglas que rigen este
 * caso de uso:
 *
 * 1. Se persiste inmediatamente, correo por correo, sin trabajo intermedio.
 * 2. Si la persistencia falla, el código se registra en el log a nivel `error`.
 *    Escribir un código en el log no es bonito, pero la alternativa es perderlo
 *    sin rastro: no hay forma de volver a pedirlo, y con el log al menos el
 *    operador puede dárselo al cliente a mano dentro de los 15 minutos que dura.
 */

export interface RequestProviderCodeInput {
  /** Identificador del perfil en el proveedor. */
  readonly providerProfileId: string;
  /**
   * Buzón de la cuenta tal y como está guardado en `streaming_accounts`.
   *
   * Se usa como dirección de destino en la ingesta —en lugar del `toAddress` que
   * venga en el correo— porque es la llave con la que el RPC resuelve la cuenta.
   * Si el proveedor entregara el mismo buzón escrito de otra forma (un alias,
   * otra capitalización), el PIN se guardaría sin cuenta y no lo vería nadie.
   */
  readonly inboxEmail: string;
}

export interface RequestProviderCodeOutcome {
  /** Correos que llegaron del proveedor. */
  readonly correos: number;
  /** De ésos, cuántos produjeron un PIN nuevo. */
  readonly codigos: number;
  /** Cuántos ya estaban registrados de una consulta anterior. */
  readonly duplicados: number;
  /** Sólo cuando no vino ningún correo: por qué. */
  readonly motivo: MotivoSinCorreo | null;
}

export class RequestProviderCodeUseCase {
  constructor(
    private readonly provider: CodeProvider,
    private readonly processInboundEmail: ProcessInboundEmailUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: RequestProviderCodeInput,
  ): Promise<Result<RequestProviderCodeOutcome, DomainError>> {
    const correos = await this.provider.fetchEmails(input.providerProfileId);
    if (!correos.ok) return correos;

    // Lista vacía es un resultado normal: todavía no hay correo, o el que había
    // ya se consumió. Quien llama decide qué decirle al cliente.
    if (correos.value.emails.length === 0) {
      return ok({ correos: 0, codigos: 0, duplicados: 0, motivo: correos.value.motivo });
    }

    let codigos = 0;
    let duplicados = 0;

    for (const correo of correos.value.emails) {
      const resultado = await this.processInboundEmail.execute({
        messageId: `${this.provider.slug}:${correo.messageId}`,
        to: input.inboxEmail,
        from: correo.from,
        subject: correo.subject,
        text: correo.text,
        html: correo.html,
        receivedAt: correo.receivedAt,
        rawPayload: {
          provider: this.provider.slug,
          providerProfileId: input.providerProfileId,
          providerMessageId: correo.messageId,
          providerToAddress: correo.to,
        },
      });

      if (!resultado.ok) {
        // Última red antes de perderlo del todo: ver la nota de la cabecera.
        this.logger.error('No se pudo guardar un código ya consumido del proveedor', {
          provider: this.provider.slug,
          providerProfileId: input.providerProfileId,
          messageId: correo.messageId,
          error: resultado.error.message,
        });

        return err(
          DomainError.infrastructure(
            'El código llegó del proveedor pero no se pudo guardar. Está en los registros del servidor.',
          ),
        );
      }

      if (resultado.value.status === 'duplicate') duplicados += 1;
      else if (resultado.value.pinId) codigos += 1;
    }

    this.logger.info('Consulta de código al proveedor completada', {
      provider: this.provider.slug,
      correos: correos.value.emails.length,
      codigos,
      duplicados,
    });

    return ok({ correos: correos.value.emails.length, codigos, duplicados, motivo: null });
  }
}
