'use client';

import { useActionState } from 'react';
import { CalendarDays, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime } from '@/lib/utils';

import { revokeAssignmentAction, updateClientSubscriptionAction } from '../actions';

export interface ClientSubscription {
  assignmentId: string;
  serviceName: string;
  brandColor: string;
  accountLabel: string;
  profileLabel: string;
  expiresAt: string | null;
  isExpired: boolean;
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

/**
 * Editor situado dentro de la ficha del cliente. Evita obligar al operador a
 * recordar desde qué cuenta salió un perfil cuando está atendiendo una consulta
 * por nombre, que es el flujo habitual de soporte.
 */
export function ClientSubscriptions({ subscriptions }: { subscriptions: ClientSubscription[] }) {
  if (subscriptions.length === 0) {
    return (
      <p className="text-sm text-[var(--color-content-muted)]">
        Este cliente no tiene perfiles activos.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {subscriptions.map((subscription) => (
        <ClientSubscriptionEditor key={subscription.assignmentId} subscription={subscription} />
      ))}
    </ul>
  );
}

function ClientSubscriptionEditor({ subscription }: { subscription: ClientSubscription }) {
  const [state, updateAction] = useActionState<ActionState, FormData>(
    updateClientSubscriptionAction,
    {},
  );

  return (
    <li className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: subscription.brandColor }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {subscription.serviceName} · {subscription.profileLabel}
          </p>
          <p className="truncate text-xs text-[var(--color-content-muted)]">
            {subscription.accountLabel}
          </p>
          <Badge tone={subscription.isExpired ? 'danger' : 'success'} className="mt-2">
            {subscription.isExpired
              ? subscription.expiresAt
                ? `Venció ${formatDateTime(subscription.expiresAt)}`
                : 'Vencida'
              : subscription.expiresAt
                ? `Vence ${formatDateTime(subscription.expiresAt)}`
                : 'Sin vencimiento'}
          </Badge>
        </div>
      </div>

      <div className="mt-3 border-t-2 border-[var(--color-border)] pt-3">
        <form action={updateAction} className="flex flex-col gap-2">
          <input type="hidden" name="assignmentId" value={subscription.assignmentId} />
          <label className="flex flex-col gap-1 text-xs font-semibold">
            <span className="flex items-center gap-1 text-[var(--color-content-muted)]">
              <CalendarDays aria-hidden className="size-3.5" /> Vencimiento
            </span>
            <input
              type="date"
              name="expiresAt"
              defaultValue={toDateInput(subscription.expiresAt)}
              className="h-9 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
            />
          </label>
          <p className="text-[0.7rem] text-[var(--color-content-muted)]">
            Déjalo vacío para quitar el vencimiento.
          </p>
          {state.error && <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">{state.error}</p>}
          {state.success && <p role="status" className="text-xs font-semibold text-[var(--color-success)]">{state.success}</p>}
          <Button type="submit" size="sm">
            <Pencil aria-hidden className="size-3.5" strokeWidth={2.5} />
            Guardar fecha
          </Button>
        </form>
        <form action={revokeAssignmentAction} className="mt-2">
          <input type="hidden" name="assignmentId" value={subscription.assignmentId} />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            onClick={(event) => {
              if (!window.confirm('¿Quitar esta suscripción? El perfil quedará libre y el cliente perderá el acceso.')) {
                event.preventDefault();
              }
            }}
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={2.5} />
            Quitar suscripción
          </Button>
        </form>
      </div>
    </li>
  );
}
