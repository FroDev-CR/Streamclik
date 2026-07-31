import type { AssignmentRepository } from '@/core/ports/repositories';
import type { Logger } from '@/core/ports/logger';
import type { DomainError } from '@/core/shared/errors';
import { ok, type Result } from '@/core/shared/result';

/**
 * Revocar el acceso de un cliente a un perfil.
 *
 * La fila NO se borra: se marca como `revoked`. Dos motivos:
 *
 * 1. El historial de quién tuvo acceso y hasta cuándo es lo que resuelve las
 *    disputas ("alguien más entró en mi perfil").
 * 2. Los PIN pasados quedan ligados a esa ventana temporal. Borrar la asignación
 *    dejaría huérfano el registro de qué códigos pudo ver esa persona.
 *
 * El efecto de seguridad es inmediato: `has_account_access()` exige
 * `status = 'active'`, así que la revocación corta el acceso a los PIN en la
 * siguiente consulta y también en las suscripciones de Realtime.
 */
export class RevokeAssignmentUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly logger: Logger,
  ) {}

  async execute(assignmentId: string): Promise<Result<void, DomainError>> {
    const result = await this.assignments.revoke(assignmentId);

    if (!result.ok) {
      this.logger.warn('Fallo al revocar la asignación', {
        assignmentId,
        error: result.error.message,
      });
      return result;
    }

    this.logger.info('Asignación revocada', { assignmentId });
    return ok(undefined);
  }
}
