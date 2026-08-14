'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, KeyRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime } from '@/lib/utils';

import { solicitarCambioPinAction } from '../actions';
import type { PinChangeRequestStatusRow } from '../queries';

/**
 * Pedir un cambio de PIN.
 *
 * El cliente no puede cambiarlo por su cuenta: hacerlo exige entrar a Netflix
 * con las credenciales de la cuenta, y entregárselas anularía el aislamiento
 * entre los inquilinos que la comparten. Así que pide aquí, y el operador entra
 * y lo aplica desde la cola de `/admin/solicitudes`.
 */

const ESTADO: Record<PinChangeRequestStatusRow['status'], { etiqueta: string; tono: 'neutral' | 'success' | 'danger' }> = {
  pending: { etiqueta: 'Pendiente', tono: 'neutral' },
  done: { etiqueta: 'Aplicado', tono: 'success' },
  rejected: { etiqueta: 'Rechazado', tono: 'danger' },
};

function BotonEnviar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar solicitud'}
    </Button>
  );
}

export function PinChangeRequest({
  accountId,
  accountProfileId,
  latestRequest,
}: {
  accountId: string;
  accountProfileId: string;
  latestRequest: PinChangeRequestStatusRow | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(solicitarCambioPinAction, {});
  const [abierto, setAbierto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Cerrar el formulario y limpiarlo tras el envío: la tarjeta pasa a mostrar el
  // estado «Pendiente» en cuanto la página se refresca con la fila nueva.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setAbierto(false);
    }
  }, [state.success]);

  const pendiente = latestRequest?.status === 'pending';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-4 text-[var(--color-accent)]" />
            PIN del perfil
          </CardTitle>

          {latestRequest && (
            <Badge tone={ESTADO[latestRequest.status].tono}>
              {ESTADO[latestRequest.status].etiqueta}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {latestRequest && (
          <p className="text-xs text-[var(--color-content-muted)]">
            {latestRequest.status === 'pending' &&
              `Pediste el PIN ${latestRequest.requestedPin} el ${formatDateTime(latestRequest.createdAt)}. Lo aplicamos en cuanto entremos a la cuenta.`}
            {latestRequest.status === 'done' && 'Tu último cambio de PIN ya está aplicado.'}
            {latestRequest.status === 'rejected' &&
              `No pudimos aplicar el PIN ${latestRequest.requestedPin}.${
                latestRequest.note ? ` Motivo: ${latestRequest.note}` : ''
              }`}
          </p>
        )}

        {state.success && (
          <p
            role="status"
            className="flex items-center gap-2 text-xs font-semibold text-[var(--color-success)]"
          >
            <Check aria-hidden className="size-4" />
            {state.success}
          </p>
        )}

        {pendiente ? (
          <p className="text-xs text-[var(--color-content-subtle)]">
            No puedes pedir otro cambio mientras este siga pendiente.
          </p>
        ) : !abierto ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAbierto(true)}>
            <KeyRound aria-hidden className="size-4" strokeWidth={2.5} />
            Pedir cambio de PIN
          </Button>
        ) : (
          <form ref={formRef} action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="accountProfileId" value={accountProfileId} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requestedPin">PIN nuevo (4 dígitos)</Label>
              <Input
                id="requestedPin"
                name="requestedPin"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="0000"
                className="w-28 text-center font-mono text-lg tracking-[0.3em]"
                error={state.fieldErrors?.requestedPin}
                required
              />
            </div>

            {state.error && (
              <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
                {state.error}
              </p>
            )}

            <div className="flex gap-2">
              <BotonEnviar />
              <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
