import type { DomainError } from '@/core/shared/errors';
import type { Result } from '@/core/shared/result';
import type { PinCodeType, EmailParseStatus, StreamingAccount } from '@/core/domain/entities';

/**
 * Puertos de repositorio.
 *
 * Interfaces pequeñas y específicas en lugar de un `IRepository<T>` genérico con
 * veinte métodos (principio de segregación de interfaces). Un caso de uso
 * declara exactamente lo que necesita, y el doble de test que se escribe para
 * probarlo implementa tres métodos, no veinte.
 */

// -----------------------------------------------------------------------------

export interface AccountRepository {
  findByInboxEmail(inboxEmail: string): Promise<Result<StreamingAccount | null, DomainError>>;
}

// -----------------------------------------------------------------------------

/** Entrada del RPC atómico de ingesta. */
export interface IngestEmailInput {
  messageId: string;
  toAddress: string;
  fromAddress: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  rawPayload: unknown;
  receivedAt: Date;
  code: string | null;
  codeType: PinCodeType;
  actionUrl: string | null;
  parseStatus: EmailParseStatus;
  parseError: string | null;
}

/**
 * Resultado de la ingesta.
 *
 * `status` distingue los cuatro desenlaces posibles porque el webhook responde
 * distinto a cada uno, y la diferencia entre `duplicate` y un fallo real
 * determina si el proveedor de correo reintenta:
 *
 * - `created`   → PIN nuevo, notificaciones encoladas
 * - `duplicate` → el proveedor reintentó; no hacer nada (200)
 * - `ignored`   → buzón sin cuenta asociada; acusar recibo y descartar (200)
 * - `unparsed`  → correo guardado, sin código; material de diagnóstico (200)
 */
export interface IngestEmailOutcome {
  status: 'created' | 'duplicate' | 'ignored' | 'unparsed';
  inboundEmailId?: string;
  pinId?: string;
  accountId?: string;
  queuedNotifications?: number;
}

export interface InboundEmailRepository {
  /** Persiste correo, PIN y notificaciones en una única transacción. */
  ingest(input: IngestEmailInput): Promise<Result<IngestEmailOutcome, DomainError>>;
}

// -----------------------------------------------------------------------------

export interface AssignProfileInput {
  accountProfileId: string;
  userId: string;
  assignedBy: string;
  expiresAt: Date | null;
}

export interface AssignmentRepository {
  assign(input: AssignProfileInput): Promise<Result<{ assignmentId: string }, DomainError>>;
  revoke(assignmentId: string): Promise<Result<void, DomainError>>;
  countActiveByAccount(accountId: string): Promise<Result<number, DomainError>>;
  getAccountIdForProfile(accountProfileId: string): Promise<Result<string | null, DomainError>>;
  getAccountCapacity(accountId: string): Promise<Result<number, DomainError>>;
}
