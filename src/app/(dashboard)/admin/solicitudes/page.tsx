import type { Metadata } from 'next';
import { AlertTriangle, LifeBuoy } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { PinChangeQueue } from '@/features/pins/components/pin-change-queue';
import { getPendingPinChangeRequests } from '@/features/pins/queries';
import { AccountReportQueue } from '@/features/reports/components/report-queue';
import { getPendingAccountReports } from '@/features/reports/queries';

export const metadata: Metadata = { title: 'Solicitudes' };

/**
 * Todo lo que el cliente pide y el operador resuelve, en una sola pantalla.
 *
 * Son dos colas distintas —cambios de PIN y problemas con una cuenta— pero para
 * el operador es el mismo momento del día: sentarse a resolver lo que le
 * pidieron. Separarlas en dos pestañas obligaba a mirar en dos sitios para saber
 * si quedaba algo pendiente, y una de las dos acababa olvidada.
 */
export default async function SolicitudesPage() {
  await requireAdmin();

  const [pendientes, reportes] = await Promise.all([
    getPendingPinChangeRequests(),
    getPendingAccountReports(),
  ]);

  const total = pendientes.data.length + reportes.data.length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <LifeBuoy aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Solicitudes
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          {total === 0
            ? 'Aquí aparecen los reportes de cuentas y los cambios de PIN que pidan tus clientes.'
            : `${total} ${total === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu respuesta.`}
        </p>
      </header>

      {(pendientes.error || reportes.error) && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar las solicitudes
          </p>
          <p className="mt-2 font-mono text-xs">{pendientes.error ?? reportes.error}</p>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-wider">
          Problemas reportados
          {reportes.data.length > 0 && ` · ${reportes.data.length}`}
        </h2>
        <AccountReportQueue reports={reportes.data} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-wider">
          Cambios de PIN
          {pendientes.data.length > 0 && ` · ${pendientes.data.length}`}
        </h2>
        <PinChangeQueue requests={pendientes.data} />
      </section>
    </div>
  );
}
