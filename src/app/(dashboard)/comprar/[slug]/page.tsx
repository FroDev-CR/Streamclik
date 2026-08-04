import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireUser } from '@/features/auth/session';
import { CheckoutForm } from '@/features/orders/components/checkout-form';
import { getPaymentSettings, getServiceBySlug } from '@/features/orders/queries';
import { yaCompletoOnboarding } from '@/features/settings/onboarding';

export const metadata: Metadata = { title: 'Comprar' };

/**
 * Compra de un perfil.
 *
 * El precio se lee aquí y se vuelve a leer en la Server Action antes de guardar
 * el pedido. Lo que se muestra en pantalla es informativo: si el formulario
 * enviara el importe, cualquiera podría comprar por un colón editando el HTML.
 */
export default async function ComprarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/comprar/${slug}`);

  // El operador gestiona inventario, no compra. Sin esto acabaría con perfiles
  // asignados a sí mismo, que fue justo lo que se quitó del panel.
  if (user.profile.role === 'admin') redirect('/admin/pagos');

  // El WhatsApp es el canal por el que se resuelve un pago dudoso: pedirlo
  // después de cobrar sirve de poco.
  if (!yaCompletoOnboarding(user.profile)) redirect('/bienvenida');

  const [servicio, datosPago] = await Promise.all([getServiceBySlug(slug), getPaymentSettings()]);

  if (!servicio) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          Paso final
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
          Paga y envía tu comprobante
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Hacés el SINPE desde tu banco, subís la captura y nosotros verificamos. En cuanto lo
          confirmemos, tu perfil aparece en «Mis suscripciones».
        </p>
      </header>

      <CheckoutForm
        productId={servicio.id}
        serviceName={servicio.name}
        brandColor={servicio.brand_color}
        priceAmount={Number(servicio.price_amount)}
        priceCurrency={servicio.price_currency}
        sinpeNumber={datosPago.sinpeNumber}
        sinpeName={datosPago.sinpeName}
        instructions={datosPago.instructions}
      />
    </div>
  );
}
