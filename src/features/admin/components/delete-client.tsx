'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/features/shared/action-state';

import { deleteClientAction } from '../actions';

/**
 * Borrar un cliente de prueba.
 *
 * Confirmación en dos pasos y no `confirm()` del navegador: algunos contextos lo
 * bloquean y, sobre todo, no puede explicar qué se lleva por delante. Aquí se
 * dicen las dos cosas que no se ven venir: que también desaparece la cuenta de
 * acceso —el perfil vive en la base de datos, pero la identidad vive en Clerk, y
 * borrar sólo una deja al cliente reapareciendo solo— y cuántos pedidos se van
 * con él.
 *
 * Se puede borrar a cualquiera, tenga historial o no. La cuenta del recuento no
 * bloquea: informa.
 */

function BotonConfirmar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="danger" disabled={pending}>
      {pending ? 'Borrando…' : 'Sí, borrar del todo'}
    </Button>
  );
}

export function DeleteClient({
  clientId,
  nombre,
  totalPedidos,
  totalAsignaciones,
}: {
  clientId: string;
  nombre: string;
  totalPedidos: number;
  totalAsignaciones: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteClientAction, {});
  const [confirmando, setConfirmando] = useState(false);

  const conHistorial = totalPedidos > 0 || totalAsignaciones > 0;

  if (state.success) {
    return (
      <p role="status" className="text-xs font-bold text-[var(--color-success)]">
        {state.success}
      </p>
    );
  }

  if (!confirmando) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setConfirmando(true)}
        aria-label={`Borrar a ${nombre}`}
      >
        <Trash2 aria-hidden className="size-3.5" strokeWidth={2.5} />
        Borrar
      </Button>
    );
  }

  // Lo que la cascada se lleva por delante. Se enumera antes de confirmar, no
  // después: un borrado irreversible tiene que enseñar sus consecuencias.
  const arrastra = [
    totalPedidos > 0 ? `${totalPedidos} ${totalPedidos === 1 ? 'pedido' : 'pedidos'}` : null,
    totalAsignaciones > 0
      ? `${totalAsignaciones} ${totalAsignaciones === 1 ? 'perfil asignado' : 'perfiles asignados'}`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-3">
      <p className="text-xs font-semibold">
        ¿Borrar a «{nombre}»? Desaparece su perfil y también su cuenta de acceso, así que no podrá
        volver a entrar con ese correo. No se puede deshacer.
      </p>

      {conHistorial && (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-[var(--color-danger)]">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
          <span>
            Se borran también {arrastra.join(' y ')}. Los perfiles del banco quedan libres, pero su
            historial de compras se pierde.
          </span>
        </p>
      )}

      {state.error && (
        <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <BotonConfirmar />
        </form>

        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
