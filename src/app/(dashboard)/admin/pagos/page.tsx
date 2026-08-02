import type { Metadata } from 'next';
import { AlertTriangle, Wallet } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { PaymentReview } from '@/features/orders/components/payment-review';
import { PaymentSettingsForm } from '@/features/orders/components/payment-settings-form';
import { getPaymentSettings, getPendingOrders } from '@/features/orders/queries';

export const metadata: Metadata = { title: 'Pagos' };

/**
 * Cola de pagos por verificar.
 *
 * Es la pantalla donde el operador pasa de «alguien dice que pagó» a «el cliente
 * ya tiene su perfil», con un solo botón. Los pedidos salen ordenados por
 * antigüedad, que es el orden en el que hay que atenderlos.
 */
export default async function PagosPage() {
  await requireAdmin();

  const [pendientes, datosPago] = await Promise.all([getPendingOrders(), getPaymentSettings()]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Wallet aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Pagos
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          {pendientes.data.length === 0
            ? 'Aquí aparecen los comprobantes en cuanto un cliente los envía.'
            : `${pendientes.data.length} ${
                pendientes.data.length === 1 ? 'comprobante espera' : 'comprobantes esperan'
              } tu verificación. Mira la captura y suelta la cuenta.`}
        </p>
      </header>

      {pendientes.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar los pagos
          </p>
          <p className="mt-2 font-mono text-xs">{pendientes.error}</p>
        </div>
      )}

      <PaymentReview orders={pendientes.data} />

      <PaymentSettingsForm settings={datosPago} />
    </div>
  );
}
