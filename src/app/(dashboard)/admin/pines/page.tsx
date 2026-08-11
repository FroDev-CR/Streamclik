import type { Metadata } from 'next';
import { AlertTriangle, KeyRound } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { PinChangeQueue } from '@/features/pins/components/pin-change-queue';
import { getPendingPinChangeRequests } from '@/features/pins/queries';

export const metadata: Metadata = { title: 'Cambios de PIN' };

/**
 * Cola de solicitudes de cambio de PIN.
 *
 * El cliente no puede cambiar el PIN de su perfil por su cuenta: hacerlo exige
 * entrar a Netflix con las credenciales de la cuenta. Aquí el operador ve qué
 * pidió cada cliente y con un botón lo deja aplicado, ordenado por antigüedad.
 */
export default async function PinesPage() {
  await requireAdmin();

  const pendientes = await getPendingPinChangeRequests();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <KeyRound aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Cambios de PIN
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          {pendientes.data.length === 0
            ? 'Aquí aparecen las solicitudes en cuanto un cliente pide cambiar el PIN de su perfil.'
            : `${pendientes.data.length} ${
                pendientes.data.length === 1 ? 'solicitud espera' : 'solicitudes esperan'
              } que entres a la cuenta y apliques el PIN nuevo.`}
        </p>
      </header>

      {pendientes.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar las solicitudes
          </p>
          <p className="mt-2 font-mono text-xs">{pendientes.error}</p>
        </div>
      )}

      <PinChangeQueue requests={pendientes.data} />
    </div>
  );
}
