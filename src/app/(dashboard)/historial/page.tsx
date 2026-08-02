import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { requireUser } from '@/features/auth/session';
import { OrderHistory } from '@/features/orders/components/order-history';
import { getMyOrders } from '@/features/orders/queries';

export const metadata: Metadata = { title: 'Mis compras' };

/**
 * Historial de compras del cliente.
 *
 * Existe separado de «Mis suscripciones» porque responden a preguntas
 * distintas: allí está lo que el cliente **tiene** ahora mismo, y aquí lo que
 * **pidió**, incluido lo que todavía se está verificando o lo que no salió
 * adelante. Mezclarlos obligaría a mostrar tarjetas de suscripción vacías para
 * pedidos que aún no tienen cuenta detrás.
 */
export default async function HistorialPage() {
  const user = await requireUser('/historial');

  if (user.profile.role === 'admin') redirect('/admin/pagos');

  const pedidos = await getMyOrders();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
            Mis compras
          </h1>
          <p className="mt-3 text-sm text-[var(--color-content-muted)]">
            Todo lo que has pedido y en qué estado va cada cosa.
          </p>
        </div>

        <Link href="/catalogo">
          <Button>
            <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
            Comprar otro perfil
          </Button>
        </Link>
      </header>

      {/* Un fallo de consulta se muestra en lugar de degradar a lista vacía: un
          historial vacío por error es indistinguible de uno vacío de verdad. */}
      {pedidos.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudo cargar tu historial
          </p>
          <p className="mt-2 font-mono text-xs">{pedidos.error}</p>
        </div>
      )}

      <OrderHistory orders={pedidos.data} />
    </div>
  );
}
