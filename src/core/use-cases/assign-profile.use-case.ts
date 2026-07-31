import type { AssignmentRepository } from '@/core/ports/repositories';
import type { Logger } from '@/core/ports/logger';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';

/**
 * Asignar un perfil de una cuenta a un cliente.
 *
 * Sí merece ser un caso de uso (a diferencia de las lecturas, ver ADR-0006):
 * tiene invariantes de negocio que proteger y orquesta varias comprobaciones.
 */

export interface AssignProfileCommand {
  accountProfileId: string;
  userId: string;
  assignedBy: string;
  /** `null` = sin vencimiento. Habitualmente 30 días desde hoy. */
  expiresAt: Date | null;
}

export class AssignProfileUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly logger: Logger,
  ) {}

  async execute(command: AssignProfileCommand): Promise<Result<{ assignmentId: string }, DomainError>> {
    if (command.expiresAt && command.expiresAt.getTime() <= Date.now()) {
      return err(DomainError.validation('La fecha de vencimiento debe ser futura'));
    }

    const accountIdResult = await this.assignments.getAccountIdForProfile(command.accountProfileId);
    if (!accountIdResult.ok) return accountIdResult;

    const accountId = accountIdResult.value;
    if (!accountId) {
      return err(DomainError.notFound('Perfil de cuenta', command.accountProfileId));
    }

    // Regla de negocio: no se puede vender más allá de la capacidad de la cuenta.
    // Sobrepasarla significa que dos clientes compiten por el mismo perfil de
    // Netflix y ambos reclaman.
    const [activeResult, capacityResult] = await Promise.all([
      this.assignments.countActiveByAccount(accountId),
      this.assignments.getAccountCapacity(accountId),
    ]);

    if (!activeResult.ok) return activeResult;
    if (!capacityResult.ok) return capacityResult;

    if (activeResult.value >= capacityResult.value) {
      return err(
        DomainError.conflict('La cuenta ya alcanzó su número máximo de perfiles asignados', {
          accountId,
          active: activeResult.value,
          capacity: capacityResult.value,
        }),
      );
    }

    const result = await this.assignments.assign({
      accountProfileId: command.accountProfileId,
      userId: command.userId,
      assignedBy: command.assignedBy,
      expiresAt: command.expiresAt,
    });

    // El repositorio traduce la violación del índice único
    // `one_active_assignment_per_profile` a un DomainError.conflict. Esa
    // comprobación NO se hace aquí a propósito: dos peticiones concurrentes
    // pasarían ambas una validación en código, pero sólo una gana el índice
    // único. La base de datos es la única que puede arbitrar la carrera.
    if (!result.ok) {
      this.logger.warn('Fallo al asignar el perfil', {
        accountProfileId: command.accountProfileId,
        userId: command.userId,
        error: result.error.message,
      });
      return result;
    }

    this.logger.info('Perfil asignado', {
      assignmentId: result.value.assignmentId,
      accountProfileId: command.accountProfileId,
      userId: command.userId,
    });

    return ok(result.value);
  }
}
