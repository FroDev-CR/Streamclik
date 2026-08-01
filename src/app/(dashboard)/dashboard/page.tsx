import type { Metadata } from 'next';
import { Inbox } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { AccountCard } from '@/features/accounts/components/account-card';
import { getMyAccounts } from '@/features/accounts/queries';
import { requireUser } from '@/features/auth/session';
import { LivePinCard } from '@/features/pins/components/live-pin-card';
import { getLatestPin } from '@/features/pins/queries';

export const metadata: Metadata = { title: 'Mis cuentas' };

/**
 * Dashboard del cliente.
 *
 * Server Component: los datos se consultan en el servidor con la sesión del
 * usuario y se envían como HTML. La lista de cuentas nunca viaja como JSON a
 * través de una API, lo que reduce a la vez el JavaScript enviado y la
 * superficie por la que podrían filtrarse datos.
 *
 * `LivePinCard` es el único fragmento cliente, porque necesita Realtime.
 */
export default async function DashboardPage() {
  const user = await requireUser('/dashboard');
  const accounts = await getMyAccounts(user.id);

  if (accounts.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Inbox aria-hidden className="size-8 text-[var(--color-content-subtle)]" />
        <h1 className="text-lg font-medium">Todavía no tienes cuentas asignadas</h1>
        <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
          Cuando el administrador te asigne un perfil, aparecerá aquí junto con sus códigos de
          verificación.
        </p>
      </Card>
    );
  }

  // Se muestra el visor en vivo de la primera cuenta directamente en el
  // dashboard: en el caso mayoritario (un cliente, una cuenta) evita un clic
  // justo cuando el usuario tiene prisa por leer el código.
  const [primary] = accounts;
  const primaryPin = primary ? await getLatestPin(primary.accountId) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">
          Hola{user.profile.fullName ? `, ${user.profile.fullName.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-content-muted)]">
          {accounts.length === 1
            ? 'Tienes 1 cuenta activa'
            : `Tienes ${accounts.length} cuentas activas`}
        </p>
      </div>

      {primary && (
        <LivePinCard
          accountId={primary.accountId}
          accountLabel={`${primary.serviceName} · ${primary.profileLabel}`}
          initialPin={primaryPin}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--color-content-muted)]">Todas mis cuentas</h2>
        <div className="grid gap-3">
          {accounts.map((account) => (
            <AccountCard key={account.assignmentId} account={account} />
          ))}
        </div>
      </section>
    </div>
  );
}
