'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCheck, Inbox, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PlatformIcon } from '@/components/platform-icon';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

import { aplicarCambioPinAction, rechazarCambioPinAction } from '../actions';
import type { PendingPinChangeRequestRow } from '../queries';

/**
 * Cola de solicitudes de cambio de PIN.
 *
 * Un solo gesto para el caso normal: entrar a la cuenta, poner el PIN que pidió
 * el cliente y pulsar «Aplicar». El PIN que se copia a `account_profiles` es el
 * que el cliente escribió aquí, no algo que el operador tenga que volver a
 * teclear en otro sitio.
 */

function BotonAplicar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        'Aplicando…'
      ) : (
        <>
          <CheckCheck aria-hidden className="size-4" strokeWidth={2.5} />
          Aplicar cambio
        </>
      )}
    </Button>
  );
}

/** Rechazo con nota. La nota se muestra al cliente en su panel. */
function FormularioRechazo({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(rechazarCambioPinAction, {});
  const [abierto, setAbierto] = useState(false);
  const idNota = `nota-rechazo-pin-${requestId}`;

  if (state.success) {
    return (
      <p role="status" className="text-xs font-semibold text-[var(--color-content-muted)]">
        {state.success}
      </p>
    );
  }

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        <X aria-hidden className="size-4" strokeWidth={2.5} />
        Rechazar
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />

      <Label htmlFor={idNota}>Motivo (lo verá el cliente)</Label>
      <Input
        id={idNota}
        name="note"
        placeholder="No se pudo cambiar en este momento"
        maxLength={280}
        error={state.error}
      />

      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm">
          Confirmar rechazo
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Volver
        </Button>
      </div>
    </form>
  );
}

function SolicitudPendiente({ request }: { request: PendingPinChangeRequestRow }) {
  const [state, formAction] = useActionState<ActionState, FormData>(aplicarCambioPinAction, {});

  // Aplicada en esta misma sesión: la tarjeta se queda para confirmar qué pasó,
  // en lugar de desaparecer y dejar al operador dudando si pulsó bien.
  const resuelta = Boolean(state.success);

  return (
    <Card className={resuelta ? 'opacity-70' : undefined}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-white">
              <PlatformIcon iconKey={request.iconKey} name={request.serviceName} className="size-6" />
            </span>

            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                {request.serviceName} · {request.profileLabel}
              </p>
              <p className="truncate text-xs text-[var(--color-content-muted)]">
                {request.userName ? `${request.userName} · ` : ''}
                {request.userEmail}
              </p>
            </div>
          </div>

          <div className="text-right">
            <Badge tone="accent">PIN {request.requestedPin}</Badge>
            <p className="mt-1 text-xs text-[var(--color-content-muted)]">
              {formatRelativeTime(request.createdAt)}
            </p>
          </div>
        </div>

        {request.note && (
          <p className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-xs">
            <span className="font-bold uppercase">Nota del cliente: </span>
            {request.note}
          </p>
        )}

        <p className="text-xs text-[var(--color-content-muted)]">
          {request.accountLabel} · Pedido el {formatDateTime(request.createdAt)}
        </p>

        {state.error && (
          <p
            role="alert"
            className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--color-danger)]"
          >
            {state.error}
          </p>
        )}

        {state.success ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2 text-sm font-semibold"
          >
            <CheckCheck aria-hidden className="size-4" />
            {state.success}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[var(--color-border)] pt-4">
            <form action={formAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <BotonAplicar />
            </form>

            <FormularioRechazo requestId={request.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PinChangeQueue({ requests }: { requests: PendingPinChangeRequestRow[] }) {
  if (requests.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Inbox aria-hidden className="size-8" strokeWidth={2} />
        <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase">
          Nada por resolver
        </p>
        <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
          Cuando un cliente pida cambiar el PIN de su perfil aparecerá aquí para que entres a la
          cuenta y lo apliques.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {requests.map((request) => (
        <SolicitudPendiente key={request.id} request={request} />
      ))}
    </div>
  );
}
