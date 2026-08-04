import { currentUser } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  Mail,
  Phone,
  Receipt,
  Settings,
  UserRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/features/auth/session';
import { OrderHistory } from '@/features/orders/components/order-history';
import { getMyOrders } from '@/features/orders/queries';
import { RewardsPanel } from '@/features/rewards/components/rewards-panel';
import { getMyRewards } from '@/features/rewards/queries';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Mi perfil' };

/** Centro personal del cliente: identidad, recompensas e historial. */
export default async function PerfilPage() {
  const user = await requireUser('/perfil');
  if (user.profile.role === 'admin') redirect('/admin');

  const [clerkUser, rewards, orders] = await Promise.all([
    currentUser(),
    getMyRewards(user.id),
    getMyOrders(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-center gap-5">
        {clerkUser?.imageUrl ? (
          <Image
            src={clerkUser.imageUrl}
            alt="Foto de perfil"
            width={96}
            height={96}
            unoptimized
            className="size-24 rounded-3xl border-[3px] border-[var(--color-border)] object-cover shadow-[5px_5px_0_var(--color-border)]"
          />
        ) : (
          <span className="grid size-24 place-items-center rounded-3xl border-[3px] border-[var(--color-border)] bg-[var(--color-brand-yellow)] shadow-[5px_5px_0_var(--color-border)]">
            <UserRound aria-hidden className="size-10" strokeWidth={2.5} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
            Tu cuenta StreamClick
          </p>
          <h1 className="mt-2 truncate font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
            {user.profile.fullName ?? 'Mi perfil'}
          </h1>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mail
              aria-hidden
              className="size-5 shrink-0 text-[var(--color-accent)]"
              strokeWidth={2.5}
            />
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--color-content-muted)]">
                Correo
              </p>
              <p className="truncate text-sm font-semibold">{user.email}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <Phone
              aria-hidden
              className="size-5 shrink-0 text-[var(--color-accent)]"
              strokeWidth={2.5}
            />
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--color-content-muted)]">
                WhatsApp
              </p>
              <p className="truncate text-sm font-semibold">
                {user.profile.phone ?? 'Sin configurar'}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <CalendarDays
              aria-hidden
              className="size-5 shrink-0 text-[var(--color-accent)]"
              strokeWidth={2.5}
            />
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--color-content-muted)]">
                Cliente desde
              </p>
              <p className="truncate text-sm font-semibold">
                {formatDateTime(user.profile.createdAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {rewards.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4"
        >
          <p className="flex items-center gap-2 font-semibold text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" /> No se pudieron cargar las recompensas.
          </p>
        </div>
      )}

      <RewardsPanel
        referralCode={rewards.data.referralCode}
        rewards={rewards.data.rewards}
        services={rewards.data.services}
      />

      <section
        id="historial-compras"
        className="scroll-mt-28 space-y-5 border-t-2 border-[var(--color-border)] pt-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
              <Receipt aria-hidden className="size-4" strokeWidth={2.5} /> Tus pedidos
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-4xl">
              Historial de compras
            </h2>
          </div>
          <Link href="/catalogo">
            <Button variant="secondary">Comprar más</Button>
          </Link>
        </div>

        {orders.error && (
          <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">
            No se pudo cargar tu historial.
          </p>
        )}
        <OrderHistory orders={orders.data} />
      </section>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-[family-name:var(--font-display)] font-black uppercase">
              Preferencias
            </p>
            <p className="text-sm text-[var(--color-content-muted)]">
              Configura tus avisos y datos de contacto.
            </p>
          </div>
          <Link href="/configuracion">
            <Button variant="secondary">
              <Settings aria-hidden className="size-4" /> Configuración
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
