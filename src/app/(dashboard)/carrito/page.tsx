import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireUser } from '@/features/auth/session';
import { CartCheckout } from '@/features/cart/components/cart-checkout';
import { getPublicCatalog, getPublicCombos } from '@/features/catalog/queries';
import { getPaymentSettings } from '@/features/orders/queries';
import { yaCompletoOnboarding } from '@/features/settings/onboarding';

export const metadata: Metadata = { title: 'Carrito' };

export default async function CartPage() {
  const user = await requireUser('/carrito');
  if (user.profile.role === 'admin') redirect('/admin/pagos');
  if (!yaCompletoOnboarding(user.profile)) redirect('/bienvenida');

  const [services, combos, payment] = await Promise.all([
    getPublicCatalog(),
    getPublicCombos(),
    getPaymentSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          Compra múltiple
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
          Un carrito. Un solo pago.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-content-muted)]">
          Revisa todo, paga el monto total por SINPE y adjunta una única captura.
        </p>
      </header>

      <CartCheckout
        services={services}
        combos={combos}
        sinpeNumber={payment.sinpeNumber}
        sinpeName={payment.sinpeName}
        instructions={payment.instructions}
      />
    </div>
  );
}
