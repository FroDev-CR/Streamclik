import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Inbox, Receipt, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SubscriptionCard } from '@/features/accounts/components/subscription-card';
import { getMyAccounts } from '@/features/accounts/queries';
import { requireUser } from '@/features/auth/session';
import { OrderHistory } from '@/features/orders/components/order-history';
import { getMyOrders } from '@/features/orders/queries';
import { getLivePins } from '@/features/pins/queries';
import { yaCompletoOnboarding } from '@/features/settings/onboarding';

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

  // El operador no consume suscripciones: gestiona inventario. Su pantalla de
  // inicio es el banco, y aquí sólo vería una tarjeta vacía permanente.
  if (user.profile.role === 'admin') redirect('/admin');

  // El WhatsApp se pide una sola vez, antes de dejar entrar: es el canal por el
  // que se avisará y se cobrará, y pedirlo después de que el cliente ya esté
  // usando la aplicación tiene mucha menos respuesta.
  if (!yaCompletoOnboarding(user.profile)) redirect('/bienvenida');

  const [accounts, pedidos] = await Promise.all([getMyAccounts(user.id), getMyOrders()]);

  // Los códigos en vivo se piden en paralelo: encadenarlos sumaría una ida y
  // vuelta por suscripción antes de poder pintar nada.
  const pins = await Promise.all(accounts.map((account) => getLivePins(account.accountId)));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          Hola
          {user.profile.fullName ? `, ${user.profile.fullName.split(' ')[0]}` : ''}
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

      {accounts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Inbox aria-hidden className="size-8" strokeWidth={2} />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-black uppercase">
            Aún no tienes suscripciones
          </h2>
          <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
            Cuando contrates un perfil aparecerá aquí, con su código de verificación en tiempo real
            y sus datos de acceso.
          </p>
          <Link href="/catalogo" className="mt-2">
            <Button>
              <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
              Ver catálogo
            </Button>
          </Link>
        </Card>
      ) : (
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
              initialPins={pins[indice] ?? []}
            />
          ))}
        </div>
      )}

      <section
        id="historial-compras"
        className="mt-6 flex scroll-mt-28 flex-col gap-5 border-t-2 border-[var(--color-border)] pt-8"
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
              <Receipt aria-hidden className="size-4" strokeWidth={2.5} />
              Tus pedidos
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-4xl">
              Historial de compras
            </h2>
          </div>

          <Link href="/catalogo">
            <Button variant="secondary">
              <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
              Comprar más
            </Button>
          </Link>
        </header>

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
      </section>
    </div>
  );
}
