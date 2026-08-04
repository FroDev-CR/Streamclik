import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireUser } from '@/features/auth/session';
import { CheckoutForm } from '@/features/orders/components/checkout-form';
import { getComboBySlug, getPaymentSettings } from '@/features/orders/queries';
import { yaCompletoOnboarding } from '@/features/settings/onboarding';

export const metadata: Metadata = { title: 'Comprar combo' };

export default async function ComprarComboPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/comprar/combo/${slug}`);

  if (user.profile.role === 'admin') redirect('/admin/pagos');
  if (!yaCompletoOnboarding(user.profile)) redirect('/bienvenida');

  const [combo, datosPago] = await Promise.all([getComboBySlug(slug), getPaymentSettings()]);
  if (!combo) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          Tu combo
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
          Varias apps. Un solo pago.
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Envía el comprobante y, cuando lo confirmemos, todos los perfiles del paquete aparecerán
          juntos en “Mis suscripciones”.
        </p>
      </header>

      <CheckoutForm
        productId={combo.id}
        productType="combo"
        serviceName={combo.name}
        brandColor="#075dff"
        priceAmount={Number(combo.price_amount)}
        priceCurrency={combo.price_currency}
        sinpeNumber={datosPago.sinpeNumber}
        sinpeName={datosPago.sinpeName}
        instructions={datosPago.instructions}
        includedServices={combo.services.flatMap((service) =>
          Array.from({ length: service.quantity }, () => service.name),
        )}
      />
    </div>
  );
}
