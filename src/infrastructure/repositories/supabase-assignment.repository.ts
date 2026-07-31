import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AssignProfileInput, AssignmentRepository } from '@/core/ports/repositories';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';
import type { Database } from '@/infrastructure/supabase/database.types';

/** Violación de restricción única en Postgres. */
const UNIQUE_VIOLATION = '23505';

/**
 * Implementación de `AssignmentRepository` sobre Supabase.
 *
 * Recibe el cliente con la sesión del usuario, de modo que **RLS aplica**: si
 * quien invoca no es administrador, las políticas de `profile_assignments`
 * rechazan la escritura aunque la Server Action hubiera olvidado comprobar el
 * rol. Es la defensa en profundidad de docs/adr/0003 funcionando de verdad.
 */
export class SupabaseAssignmentRepository implements AssignmentRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async assign(input: AssignProfileInput): Promise<Result<{ assignmentId: string }, DomainError>> {
    const { data, error } = await this.client
      .from('profile_assignments')
      .insert({
        account_profile_id: input.accountProfileId,
        user_id: input.userId,
        assigned_by: input.assignedBy,
        expires_at: input.expiresAt?.toISOString() ?? null,
      })
      .select('id')
      .single();

    if (error) {
      // El índice único parcial `one_active_assignment_per_profile` es lo que
      // arbitra las peticiones concurrentes: dos administradores asignando el
      // mismo perfil a la vez pasarían ambos una validación en código, pero sólo
      // uno gana el índice. Aquí se traduce esa colisión a un error de negocio
      // comprensible en lugar de propagar un error de Postgres.
      if (error.code === UNIQUE_VIOLATION) {
        return err(
          DomainError.conflict('Este perfil ya está asignado a otro cliente', {
            accountProfileId: input.accountProfileId,
          }),
        );
      }

      return err(DomainError.infrastructure(`No se pudo crear la asignación: ${error.message}`, error));
    }

    return ok({ assignmentId: data.id });
  }

  async revoke(assignmentId: string): Promise<Result<void, DomainError>> {
    // Se marca como revocada en lugar de borrar: el historial es lo que resuelve
    // las disputas sobre quién tuvo acceso y hasta cuándo.
    const { error } = await this.client
      .from('profile_assignments')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .eq('status', 'active');

    if (error) {
      return err(DomainError.infrastructure(`No se pudo revocar la asignación: ${error.message}`, error));
    }

    return ok(undefined);
  }

  async countActiveByAccount(accountId: string): Promise<Result<number, DomainError>> {
    const { data: profiles, error: profilesError } = await this.client
      .from('account_profiles')
      .select('id')
      .eq('account_id', accountId);

    if (profilesError) {
      return err(DomainError.infrastructure(profilesError.message, profilesError));
    }

    const profileIds = profiles.map((profile) => profile.id);
    if (profileIds.length === 0) return ok(0);

    const { count, error } = await this.client
      .from('profile_assignments')
      .select('id', { count: 'exact', head: true })
      .in('account_profile_id', profileIds)
      .eq('status', 'active');

    if (error) {
      return err(DomainError.infrastructure(error.message, error));
    }

    return ok(count ?? 0);
  }

  async getAccountIdForProfile(accountProfileId: string): Promise<Result<string | null, DomainError>> {
    const { data, error } = await this.client
      .from('account_profiles')
      .select('account_id')
      .eq('id', accountProfileId)
      .maybeSingle();

    if (error) {
      return err(DomainError.infrastructure(error.message, error));
    }

    return ok(data?.account_id ?? null);
  }

  async getAccountCapacity(accountId: string): Promise<Result<number, DomainError>> {
    const { data, error } = await this.client
      .from('streaming_accounts')
      .select('max_profiles')
      .eq('id', accountId)
      .maybeSingle();

    if (error) {
      return err(DomainError.infrastructure(error.message, error));
    }

    if (!data) {
      return err(DomainError.notFound('Cuenta', accountId));
    }

    return ok(data.max_profiles);
  }
}
