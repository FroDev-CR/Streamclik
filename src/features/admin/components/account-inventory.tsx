'use client';

import { useActionState } from 'react';
import { Inbox, UserPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';
import { cn, formatDateTime } from '@/lib/utils';

import { assignProfileAction, revokeAssignmentAction } from '../actions';
import type { AdminAccountRow, AdminClientOption, AdminProfileRow } from '../queries';

/**
 * Inventario de cuentas con sus perfiles y asignaciones.
 *
 * Client Component sólo por el estado de los formularios de asignación. Los
 * datos llegan ya resueltos desde el Server Component padre: no se consulta nada
 * desde el navegador.
 *
 * Cada perfil se dibuja como una ficha independiente en lugar de como una fila
 * de lista. Es el inventario que el operador vende, y ver de un vistazo cuántas
 * fichas están libres es la pregunta que se hace cada vez que entra aquí.
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
  if (clients.length === 0) {
    return (
      <p className="text-xs text-[var(--color-content-muted)]">
        No hay clientes registrados todavía.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="accountProfileId" value={profileId} />

      {/* Los tres controles se apilan en lugar de compartir fila. En la rejilla
          de perfiles la ficha mide ~230 px, y en horizontal el campo de fecha
          quedaba reducido a un icono y el nombre del cliente se cortaba a media
          palabra. */}
      <Select
        name="userId"
        required
        aria-label="Cliente"
        className="h-9 text-xs"
        defaultValue=""
      >
        {/* Etiqueta corta a propósito: la ficha es estrecha y los navegadores no
            recortan con puntos suspensivos el texto de un `select`, lo cortan a
            media palabra. El contexto ya lo da la cabecera de la ficha. */}
        <option value="" disabled>
          Cliente…
        </option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.fullName ? `${client.fullName} · ${client.email}` : client.email}
          </option>
        ))}
      </Select>

      <label className="flex flex-col gap-1">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-content-muted)]">
          Vence (opcional)
        </span>
        <input
          type="date"
          name="expiresAt"
          className="h-9 w-full rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
        />
      </label>

      <Button type="submit" size="sm" variant="accent" full>
        <UserPlus aria-hidden className="size-3.5" strokeWidth={3} />
        Asignar
      </Button>

      {state.error && <span className="text-xs font-semibold text-[var(--color-danger)]">{state.error}</span>}
    </form>
  );
}

function ProfileSlot({
  profile,
  clients,
  state,
  formAction,
}: {
  profile: AdminProfileRow;
  clients: AdminClientOption[];
  state: ActionState;
  formAction: (formData: FormData) => void;
}) {
  const asignado = profile.assignment !== null;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border-2 p-3',
        asignado
          ? 'border-[var(--color-border)] bg-[var(--color-canvas)]'
          : // El borde discontinuo comunica "hueco disponible" sin necesidad de
            // leer ninguna etiqueta.
            'border-dashed border-[var(--color-content-subtle)] bg-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase">
          {profile.profileLabel}
        </span>
        <Badge tone={asignado ? 'success' : 'neutral'}>{asignado ? 'Asignado' : 'Libre'}</Badge>
      </div>

      {profile.assignment ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col">
            <span className="truncate text-xs font-semibold">{profile.assignment.userEmail}</span>
            <span className="text-xs text-[var(--color-content-muted)]">
              {profile.assignment.expiresAt
                ? `Hasta el ${formatDateTime(profile.assignment.expiresAt)}`
                : 'Sin vencimiento'}
            </span>
          </div>

          {/* La revocación es una Server Action sin estado de retorno:
              `revalidatePath` refresca la lista y el resultado se ve
              directamente en la ficha. */}
          <form action={revokeAssignmentAction}>
            <input type="hidden" name="assignmentId" value={profile.assignment.id} />
            <Button type="submit" size="sm" variant="secondary" full>
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
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <Inbox aria-hidden className="size-8" strokeWidth={2} />
          <p className="font-[family-name:var(--font-display)] text-base font-extrabold uppercase">
            Inventario vacío
          </p>
          <p className="max-w-xs text-sm text-[var(--color-content-muted)]">
            Crea tu primera cuenta con el formulario. Sus perfiles se generan solos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {accounts.map((account) => {
        const asignados = account.profiles.filter((p) => p.assignment !== null).length;
        const total = account.profiles.length;

        return (
          <Card key={account.id} className="overflow-hidden">
            {/* Cabecera con la marca del servicio como bloque de color macizo:
                identifica Netflix frente a Disney+ antes de leer nada. */}
            <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--color-border)] p-4">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] font-[family-name:var(--font-display)] text-lg font-black text-white"
                style={{ backgroundColor: account.brandColor }}
              >
                {account.serviceName.charAt(0)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                  {account.label}
                </p>
                <p className="truncate font-mono text-xs text-[var(--color-content-muted)]">
                  {account.inboxEmail}
                </p>
              </div>

              {/* En móvil las insignias bajan a su propia línea: compartiendo
                  fila con el nombre lo estrujaban hasta dejar "NETFLI…". */}
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Badge tone={asignados === total ? 'accent' : 'neutral'}>
                  {asignados}/{total} ocupados
                </Badge>
                <Badge tone={account.status === 'active' ? 'success' : 'warning'}>
                  {account.status === 'active' ? 'Activa' : account.status}
                </Badge>
              </div>
            </div>

            <CardContent className="p-4">
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {account.profiles.map((profile) => (
                  <ProfileSlot
                    key={profile.profileId}
                    profile={profile}
                    clients={clients}
                    state={state}
                    formAction={formAction}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
