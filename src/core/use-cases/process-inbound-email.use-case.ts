import type { EmailParser, RawEmail } from '@/core/ports/email-parser';
import type { Logger } from '@/core/ports/logger';
import type {
  InboundEmailRepository,
  IngestEmailOutcome,
} from '@/core/ports/repositories';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';
import { EmailAddress } from '@/core/domain/value-objects/email-address';
import type { EmailParseStatus, PinCodeType } from '@/core/domain/entities';

/**
 * Caso de uso central del producto: correo entrante → PIN persistido.
 *
 * Recibe el correo ya normalizado por el adaptador del proveedor y devuelve el
 * desenlace. No sabe qué es HTTP, ni qué proveedor lo envió, ni que la base de
 * datos es Postgres. Por eso puede probarse por completo con dobles en memoria.
 *
 * Diseñado para no lanzar ante entradas malformadas: un correo raro es
 * información, no un fallo. Sólo un error de infraestructura produce un `err`
 * que hace que el webhook responda 500 y el proveedor reintente.
 */

export interface ProcessInboundEmailInput {
  messageId: string;
  to: string;
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: Date;
  rawPayload: unknown;
}

export class ProcessInboundEmailUseCase {
  constructor(
    private readonly parsers: readonly EmailParser[],
    private readonly repository: InboundEmailRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: ProcessInboundEmailInput,
  ): Promise<Result<IngestEmailOutcome, DomainError>> {
    // La dirección se normaliza con la MISMA función que usó la escritura de la
    // cuenta. Un desajuste aquí haría que el PIN se perdiera en silencio, que es
    // el modo de fallo más caro de este sistema porque nadie se entera.
    const routingAddress = EmailAddress.normalizeForRouting(input.to);

    const rawEmail: RawEmail = {
      from: EmailAddress.extractFromHeader(input.from),
      to: routingAddress,
      subject: input.subject ?? '',
      text: input.text,
      html: input.html,
    };

    let code: string | null = null;
    let codeType: PinCodeType = 'unknown';
    let actionUrl: string | null = null;
    let parseStatus: EmailParseStatus = 'unmatched';
    let parseError: string | null = null;

    const parser = this.parsers.find((candidate) => candidate.canHandle(rawEmail));

    if (!parser) {
      // Frecuente y benigno: correos promocionales, avisos de facturación,
      // newsletters. Se registra el correo igualmente para tener trazabilidad.
      this.logger.debug('Ningún parser acepta el correo', {
        to: routingAddress,
        from: rawEmail.from,
        subject: rawEmail.subject,
      });
    } else {
      try {
        const parsed = parser.parse(rawEmail);

        if (parsed) {
          code = parsed.code;
          codeType = parsed.codeType;
          actionUrl = parsed.actionUrl;
          parseStatus = 'parsed';

          this.logger.info('Código extraído del correo', {
            service: parser.serviceSlug,
            codeType,
            matchedPattern: parsed.matchedPattern,
          });
        }
      } catch (cause) {
        // Un parser que lanza es un bug, no un correo inválido. Se captura para
        // no perder el correo: queda guardado con parse_status='failed' y su
        // cuerpo íntegro, que es exactamente el material para escribir el test
        // de regresión.
        parseStatus = 'failed';
        parseError = cause instanceof Error ? cause.message : String(cause);

        this.logger.error('El parser lanzó una excepción', {
          service: parser.serviceSlug,
          error: parseError,
        });
      }
    }

    const result = await this.repository.ingest({
      messageId: input.messageId,
      toAddress: routingAddress,
      fromAddress: rawEmail.from,
      subject: input.subject,
      bodyText: input.text,
      bodyHtml: input.html,
      rawPayload: input.rawPayload,
      receivedAt: input.receivedAt,
      code,
      codeType,
      actionUrl,
      parseStatus,
      parseError,
    });

    if (!result.ok) {
      this.logger.error('Fallo al persistir el correo entrante', {
        messageId: input.messageId,
        error: result.error.message,
      });
      return err(DomainError.infrastructure('No se pudo registrar el correo entrante', result.error));
    }

    this.logger.info('Correo entrante procesado', {
      messageId: input.messageId,
      status: result.value.status,
      pinId: result.value.pinId,
    });

    return ok(result.value);
  }
}
