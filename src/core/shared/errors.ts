/**
 * Errores de dominio tipados.
 *
 * Cada error lleva un `code` estable pensado para que la capa de presentación
 * decida qué hacer sin inspeccionar mensajes de texto. Comparar strings de
 * mensajes es frágil: cambiar la redacción para el usuario rompería la lógica.
 */

export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'DUPLICATE'
  | 'PARSE_FAILED'
  | 'INFRASTRUCTURE_ERROR';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('VALIDATION_ERROR', message, details);
  }

  static notFound(entity: string, id?: string): DomainError {
    return new DomainError('NOT_FOUND', `${entity} no encontrado`, id ? { id } : undefined);
  }

  static unauthorized(message = 'No autenticado'): DomainError {
    return new DomainError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'No autorizado'): DomainError {
    return new DomainError('FORBIDDEN', message);
  }

  static conflict(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('CONFLICT', message, details);
  }

  static duplicate(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('DUPLICATE', message, details);
  }

  static parseFailed(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('PARSE_FAILED', message, details);
  }

  /**
   * Fallo de una dependencia externa (Postgres, Auth, API de terceros).
   * Se distingue de los errores de negocio porque el webhook responde 500 ante
   * este caso, para que el proveedor de correo reintente.
   */
  static infrastructure(message: string, cause?: unknown): DomainError {
    return new DomainError('INFRASTRUCTURE_ERROR', message, {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/** Códigos que deben provocar un reintento del proveedor de correo. */
export function isRetryable(error: DomainError): boolean {
  return error.code === 'INFRASTRUCTURE_ERROR';
}
