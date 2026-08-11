import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CredentialsPanel } from '@/features/accounts/components/credentials-panel';
import { getAccountForUser } from '@/features/accounts/queries';
import { requireUser } from '@/features/auth/session';
import { LivePinCard } from '@/features/pins/components/live-pin-card';
import { PinChangeRequest } from '@/features/pins/components/pin-change-request';
import { PinHistory } from '@/features/pins/components/pin-history';
import { getLatestPinChangeRequest, getLivePins, getPinHistory } from '@/features/pins/queries';

export const metadata: Metadata = { title: 'Detalle de la cuenta' };

/**
 * Detalle de una cuenta: código en vivo, credenciales e historial.
 *
 * `notFound()` cuando el usuario no tiene acceso, en lugar de una página de
 * "prohibido". Un 403 confirmaría que esa cuenta existe, lo que permite
 * enumerar el inventario probando identificadores. Un 404 no distingue entre
 * "no existe" y "no es tuya", que es justo lo que interesa aquí.
 *
 * En Next.js 15 `params` es una promesa.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/cuenta/${id}`);

  const account = await getAccountForUser(user.id, id);
  if (!account) notFound();

  // Las tres consultas son independientes: se lanzan en paralelo para no sumar
  // sus latencias en el tiempo hasta el primer byte.
  const [livePins, history, pinChangeRequest] = await Promise.all([
    getLivePins(id),
    getPinHistory(id),
    getLatestPinChangeRequest(account.accountProfileId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" aria-label="Volver a mis cuentas">
            <ArrowLeft aria-hidden className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold">{account.serviceName}</h1>
          <p className="text-xs text-[var(--color-content-subtle)]">{account.profileLabel}</p>
        </div>
      </div>

      <LivePinCard
        accountId={account.accountId}
        accountLabel="Códigos recientes"
        initialPins={livePins}
      />

      <CredentialsPanel
        loginEmail={account.loginEmail}
        loginPassword={account.loginPassword}
        profileLabel={account.profileLabel}
        profilePin={account.profilePin}
      />

      <PinChangeRequest
        accountId={account.accountId}
        accountProfileId={account.accountProfileId}
        latestRequest={pinChangeRequest}
      />

      <PinHistory pins={history} />
    </div>
  );
}
