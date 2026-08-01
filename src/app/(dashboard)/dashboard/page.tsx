import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SubscriptionCard } from '@/features/accounts/components/subscription-card';
import { getMyAccounts } from '@/features/accounts/queries';
import { requireUser } from '@/features/auth/session';
import { getLatestPin } from '@/features/pins/queries';

export const metadata: Metadata = { title: 'Mis suscripciones' };

/**
 * Mis suscripciones — la pantalla principal del cliente.
 *
 * Server Component: los datos se consultan en el servidor con la sesión del
 * usuario y se envían como HTML. Las credenciales nunca viajan como JSON a
 * través de una API, lo que reduce a la vez el JavaScript enviado y la
 * superficie por la que podrían filtrarse.
 *
 * Cada suscripción se muestra completa —código, accesos y vencimiento— en lugar
 * de como un resumen que lleva a un detalle. El momento de uso real es siempre
 * el mismo: el cliente delante del televisor con Netflix pidiéndole un código.
 */
export default async function MisSuscripcionesPage() {
  const user = await requireUser('/dashboard');
  const accounts = await getMyAccounts(user.id);

  if (accounts.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Inbox aria-hidden className="size-8" strokeWidth={2} />
        <h1 className="font-[family-name:var(--font-display)] text-xl font-black uppercase">
          Aún no tienes suscripciones
        </h1>
        <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
          Cuando contrates un perfil aparecerá aquí, con su código de verificación en tiempo real y
          sus datos de acceso.
        </p>
        <Link href="/#catalogo" className="mt-2">
          <Button>
            <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
            Ver catálogo
          </Button>
        </Link>
      </Card>
    );
  }

  // Los últimos PIN se piden en paralelo: encadenarlos sumaría una ida y vuelta
  // por suscripción antes de poder pintar nada.
  const pins = await Promise.all(accounts.map((account) => getLatestPin(account.accountId)));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          Hola{user.profile.fullName ? `, ${user.profile.fullName.split(' ')[0]}` : ''}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
          Mis suscripciones
        </h1>
        <p className="mt-3 text-sm text-[var(--color-content-muted)]">
          {accounts.length === 1
            ? 'Tienes 1 perfil activo'
            : `Tienes ${accounts.length} perfiles activos`}
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {accounts.map((account, indice) => (
          <SubscriptionCard
            key={account.assignmentId}
            accountId={account.accountId}
            serviceName={account.serviceName}
            brandColor={account.brandColor}
            profileLabel={account.profileLabel}
            loginEmail={account.loginEmail}
            loginPassword={account.loginPassword}
            profilePin={account.profilePin}
            expiresAt={account.expiresAt}
            initialPin={pins[indice] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
