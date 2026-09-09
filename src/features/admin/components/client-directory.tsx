'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { Mail, Phone, Search, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { AdminClientRow } from '@/features/admin/queries';
import { AdminRewards } from '@/features/rewards/components/admin-rewards';

import { ClientSubscriptions } from './client-subscriptions';
import { DeleteClient } from './delete-client';

type SubscriptionFilter = 'all' | 'with-subscriptions' | 'without-subscriptions';
type StatusFilter = 'all' | 'expired' | 'due-soon' | 'attention';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/** Directorio operativo: busca clientes sin solicitar ni exponer datos nuevos. */
export function ClientDirectory({ clients }: { clients: AdminClientRow[] }) {
  const [search, setSearch] = useState('');
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [serviceFilter, setServiceFilter] = useState('all');

  const services = useMemo(
    () =>
      [...new Set(clients.flatMap((client) => client.suscripciones.map((item) => item.serviceName)))].sort(
        (a, b) => a.localeCompare(b, 'es'),
      ),
    [clients],
  );

  const visibleClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');

    return clients.filter((client) => {
      const hasSubscriptions = client.activeSubscriptions > 0;
      const matchesSubscription =
        subscriptionFilter === 'all' ||
        (subscriptionFilter === 'with-subscriptions' && hasSubscriptions) ||
        (subscriptionFilter === 'without-subscriptions' && !hasSubscriptions);
      const matchesService =
        serviceFilter === 'all' || client.suscripciones.some((item) => item.serviceName === serviceFilter);
      const hasDueSoon = client.suscripciones.some((item) => {
        if (item.isExpired || !item.expiresAt) return false;
        const remaining = new Date(item.expiresAt).getTime() - Date.now();
        return remaining >= 0 && remaining <= SEVEN_DAYS;
      });
      // "Necesitan atención" concentra los casos que requieren una acción:
      // no tienen ninguna activa, ya vencieron o ni siquiera dejaron WhatsApp.
      const needsAttention =
        client.activeSubscriptions === 0 || client.expiredSubscriptions > 0 || !client.phone;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'expired' && client.expiredSubscriptions > 0) ||
        (statusFilter === 'due-soon' && hasDueSoon) ||
        (statusFilter === 'attention' && needsAttention);
      const searchable = [client.fullName, client.email, client.phone, client.referralCode]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es');

      return matchesSubscription && matchesStatus && matchesService && (!term || searchable.includes(term));
    });
  }, [clients, search, serviceFilter, statusFilter, subscriptionFilter]);

  if (clients.length === 0) {
    return <EmptyDirectory message="Aparecerán aquí en cuanto se registren en la web." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-content-muted)]"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, correo, teléfono o código…"
            aria-label="Buscar clientes"
            className="h-10 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] pl-9 pr-3 text-sm"
          />
        </label>
        <select
          value={subscriptionFilter}
          onChange={(event) => setSubscriptionFilter(event.target.value as SubscriptionFilter)}
          aria-label="Filtrar por suscripción"
          className="h-10 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 text-sm font-semibold"
        >
          <option value="all">Todos</option>
          <option value="with-subscriptions">Con suscripciones</option>
          <option value="without-subscriptions">Sin suscripciones</option>
        </select>
        <select
          value={serviceFilter}
          onChange={(event) => setServiceFilter(event.target.value)}
          aria-label="Filtrar por plataforma"
          className="h-10 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 text-sm font-semibold"
        >
          <option value="all">Todas las plataformas</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
        <div
          className="flex flex-wrap gap-2 sm:col-span-3"
          role="group"
          aria-label="Estado de vencimiento"
        >
          <StatusButton active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            Todos
          </StatusButton>
          <StatusButton active={statusFilter === 'expired'} onClick={() => setStatusFilter('expired')}>
            Ya le venció
          </StatusButton>
          <StatusButton active={statusFilter === 'due-soon'} onClick={() => setStatusFilter('due-soon')}>
            Por vencer
          </StatusButton>
          <StatusButton active={statusFilter === 'attention'} onClick={() => setStatusFilter('attention')}>
            Necesitan atención
          </StatusButton>
        </div>
      </div>

      <p className="text-xs font-semibold text-[var(--color-content-muted)]" aria-live="polite">
        {visibleClients.length} de {clients.length}{' '}
        {clients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
      </p>

      {visibleClients.length === 0 ? (
        <EmptyDirectory message="Ningún cliente coincide con esos filtros." />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full border-2 border-[var(--color-border)] bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-white'
          : 'rounded-full border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-1.5 text-xs font-bold'
      }
    >
      {children}
    </button>
  );
}

function EmptyDirectory({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
        <UserRound aria-hidden className="size-8" strokeWidth={2} />
        <p className="font-[family-name:var(--font-display)] text-base font-extrabold uppercase">
          No hay clientes para mostrar
        </p>
        <p className="max-w-xs text-sm text-[var(--color-content-muted)]">{message}</p>
      </CardContent>
    </Card>
  );
}

function ClientCard({ client }: { client: AdminClientRow }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--color-border)] p-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] font-[family-name:var(--font-display)] text-lg font-black"
        >
          {(client.fullName ?? client.email).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
            {client.fullName ?? 'Sin nombre'}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-content-muted)]">
            <span className="inline-flex items-center gap-1">
              <Mail aria-hidden className="size-3" /> {client.email}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone aria-hidden className="size-3" /> {client.phone ?? 'sin teléfono'}
            </span>
            <span className="font-mono">Código: {client.referralCode}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {client.rewards.some((reward) => reward.status === 'available') && (
            <Badge tone="accent">
              {client.rewards.filter((reward) => reward.status === 'available').length} por reclamar
            </Badge>
          )}
          <Badge tone={client.activeSubscriptions > 0 ? 'success' : 'neutral'}>
            {client.activeSubscriptions} {client.activeSubscriptions === 1 ? 'activa' : 'activas'}
          </Badge>
          {client.expiredSubscriptions > 0 && (
            <Badge tone="danger">
              {client.expiredSubscriptions}{' '}
              {client.expiredSubscriptions === 1 ? 'vencida' : 'vencidas'}
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-4">
        <ClientSubscriptions subscriptions={client.suscripciones} />
        <AdminRewards userId={client.id} rewards={client.rewards} />
        <div className="mt-4 flex justify-end border-t-2 border-[var(--color-border)] pt-3">
          <DeleteClient
            clientId={client.id}
            nombre={client.fullName ?? client.email}
            totalPedidos={client.totalPedidos}
            totalAsignaciones={client.totalAsignaciones}
          />
        </div>
      </CardContent>
    </Card>
  );
}
