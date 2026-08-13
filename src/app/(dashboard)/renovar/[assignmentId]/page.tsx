import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { requireUser } from '@/features/auth/session';
import { RenewalForm } from '@/features/orders/components/renewal-form';
import { getPaymentSettings, getRenovacionInfo } from '@/features/orders/queries';

export const metadata: Metadata = { title: 'Renovar' };

/**
 * Renovar una suscripción.
 *
 * `notFound()` cuando la asignación no es del usuario, en lugar de una página de
 * prohibido: RLS ya devuelve vacío para las ajenas, y un 403 confirmaría que esa
 * asignación existe. Es el mismo criterio que en el detalle de la cuenta.
 *
 * No se comprueba aquí que esté dentro de la ventana de dos días. El botón del
 * panel es el que la respeta; llegar por la URL antes de tiempo sólo adelanta un
 * pago que de todas formas se suma a lo que quedaba, así que bloquearlo no
 * protege nada y sí molestaría a quien quiere pagar cuando puede.
 */
export default async function RenovarPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  await requireUser(`/renovar/${assignmentId}`);

  const [info, datosPago] = await Promise.all([
    getRenovacionInfo(assignmentId),
    getPaymentSettings(),
  ]);

  if (!info) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" aria-label="Volver a mis suscripciones">
            <ArrowLeft aria-hidden className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-none tracking-[-0.04em]">
            Renovar
          </h1>
          <p className="mt-1 text-xs text-[var(--color-content-subtle)]">
            Sigues con el mismo perfil y el mismo PIN.
          </p>
        </div>
      </div>

      <RenewalForm
        info={info}
        sinpeNumber={datosPago.sinpeNumber}
        sinpeName={datosPago.sinpeName}
        instructions={datosPago.instructions}
      />
    </div>
  );
}
