'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/features/shared/action-state';

import { deleteClientAction } from '../actions';

/**
 * Borrar un cliente de prueba.
 *
 * Confirmación en dos pasos y no `confirm()` del navegador: algunos contextos lo
 * bloquean y, sobre todo, no puede explicar qué se lleva por delante. Aquí lo
 * que se dice es que también desaparece la cuenta de acceso, que es la parte que
 * no se ve venir —el perfil vive en la base de datos, pero la identidad vive en
 * Clerk, y borrar sólo una de las dos deja al cliente reapareciendo solo.
 *
 * Cuando el cliente tiene historial no se ofrece el botón: se explica por qué.
 * Un botón que siempre falla es peor que ningún botón, porque el operador lo
 * pulsa igual y aprende a ignorar el mensaje.
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

  if (conHistorial) {
    const partes = [
      totalPedidos > 0 ? `${totalPedidos} ${totalPedidos === 1 ? 'pedido' : 'pedidos'}` : null,
      totalAsignaciones > 0
        ? `${totalAsignaciones} ${totalAsignaciones === 1 ? 'perfil' : 'perfiles'}`
        : null,
    ].filter(Boolean);

    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-[var(--color-content-subtle)]">
        <Lock aria-hidden className="size-3.5" strokeWidth={2.5} />
        No se puede borrar: tiene {partes.join(' y ')} en su historial.
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

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-3">
      <p className="text-xs font-semibold">
        ¿Borrar a «{nombre}»? Desaparece su perfil y también su cuenta de acceso, así que no podrá
        volver a entrar con ese correo. No se puede deshacer.
      </p>

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
