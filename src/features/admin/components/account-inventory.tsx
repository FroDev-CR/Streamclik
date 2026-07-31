'use client';

import { useActionState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionState } from '@/features/auth/actions';
import { formatDateTime } from '@/lib/utils';

import { assignProfileAction, revokeAssignmentAction } from '../actions';
import type { AdminAccountRow, AdminClientOption } from '../queries';

/**
 * Inventario de cuentas con sus perfiles y asignaciones.
 *
 * Client Component sólo por el estado de los formularios de asignación. Los
 * datos llegan ya resueltos desde el Server Component padre: no se consulta nada
 * desde el navegador.
 */

function AssignForm({
  profileId,
  clients,
  state,
  formAction,
}: {
  profileId: string;
  clients: AdminClientOption[];
  state: ActionState;
  formAction: (formData: FormData) => void;
}) {
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="accountProfileId" value={profileId} />

      <select
        name="userId"
        required
        aria-label="Cliente"
        className="h-8 min-w-40 rounded-md border border-[--color-border-strong] bg-[--color-surface-raised] px-2 text-xs"
      >
        <option value="">Selecciona cliente…</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.fullName ? `${client.fullName} · ${client.email}` : client.email}
          </option>
        ))}
      </select>

      <input
        type="date"
        name="expiresAt"
        aria-label="Fecha de vencimiento"
        className="h-8 rounded-md border border-[--color-border-strong] bg-[--color-surface-raised] px-2 text-xs"
      />

      <Button type="submit" size="sm" variant="secondary">
        Asignar
      </Button>

      {state.error && <span className="text-xs text-red-400">{state.error}</span>}
    </form>
  );
}

export function AccountInventory({
  accounts,
  clients,
}: {
  accounts: AdminAccountRow[];
  clients: AdminClientOption[];
}) {
  // Un único estado de acción para todo el inventario: los errores de asignación
  // se muestran junto al formulario que se acaba de enviar, que es donde el
  // administrador está mirando.
  const [state, formAction] = useActionState<ActionState, FormData>(assignProfileAction, {});

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[--color-content-muted]">
          Todavía no hay cuentas en el inventario
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account) => (
        <Card key={account.id}>
          <CardHeader className="flex-row items-center gap-3">
            <span
              aria-hidden
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: account.brandColor }}
            />
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate">{account.label}</CardTitle>
              <p className="truncate font-mono text-xs text-[--color-content-subtle]">
                {account.inboxEmail}
              </p>
            </div>
            <Badge tone={account.status === 'active' ? 'success' : 'warning'}>
              {account.status === 'active' ? 'Activa' : account.status}
            </Badge>
          </CardHeader>

          <CardContent>
            <ul className="divide-y divide-[--color-border]">
              {account.profiles.map((profile) => (
                <li
                  key={profile.profileId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="text-sm text-[--color-content]">{profile.profileLabel}</span>

                  {profile.assignment ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-[--color-content]">
                          {profile.assignment.userEmail}
                        </span>
                        <span className="text-xs text-[--color-content-subtle]">
                          {profile.assignment.expiresAt
                            ? `Hasta el ${formatDateTime(profile.assignment.expiresAt)}`
                            : 'Sin vencimiento'}
                        </span>
                      </div>

                      {/* La revocación es una Server Action sin estado de retorno:
                          `revalidatePath` refresca la lista y el resultado se ve
                          directamente en la fila. */}
                      <form action={revokeAssignmentAction}>
                        <input type="hidden" name="assignmentId" value={profile.assignment.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Revocar
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <AssignForm
                      profileId={profile.profileId}
                      clients={clients}
                      state={state}
                      formAction={formAction}
                    />
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
