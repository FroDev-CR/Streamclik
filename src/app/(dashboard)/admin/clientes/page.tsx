import type { Metadata } from 'next';
import { AlertTriangle, Mail, Phone, UserRound, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireAdmin } from '@/features/auth/session';
import { DeleteClient } from '@/features/admin/components/delete-client';
import { getAdminClients } from '@/features/admin/queries';
import { AdminRewards } from '@/features/rewards/components/admin-rewards';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Clientes' };

/**
 * Clientes — la vista inversa del banco.
 *
 * El banco parte del inventario y pregunta quién lo ocupa; esta pantalla parte
 * de la persona y pregunta qué tiene contratado. El operador necesita las dos:
 * una para vender el hueco libre, otra para atender a quien le escribe.
 */
export default async function ClientesPage() {
  await requireAdmin();

  const clientes = await getAdminClients();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Users aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Clientes
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Quién te ha comprado y qué tiene activo ahora mismo.
        </p>
      </header>

      {clientes.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudo cargar la lista
          </p>
          <p className="mt-2 font-mono text-xs">{clientes.error}</p>
        </div>
      )}

      {clientes.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <UserRound aria-hidden className="size-8" strokeWidth={2} />
            <p className="font-[family-name:var(--font-display)] text-base font-extrabold uppercase">
              Todavía no hay clientes
            </p>
            <p className="max-w-xs text-sm text-[var(--color-content-muted)]">
              Aparecerán aquí en cuanto se registren en la web.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {clientes.data.map((cliente) => (
            <Card key={cliente.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--color-border)] p-4">
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] font-[family-name:var(--font-display)] text-lg font-black"
                >
                  {(cliente.fullName ?? cliente.email).charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                    {cliente.fullName ?? 'Sin nombre'}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-content-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Mail aria-hidden className="size-3" /> {cliente.email}
                    </span>
                    {/* El teléfono es lo que hará falta para cobrar y avisar por
                        WhatsApp; que falte es un dato accionable, no un hueco. */}
                    <span className="inline-flex items-center gap-1">
                      <Phone aria-hidden className="size-3" />
                      {cliente.phone ?? 'sin teléfono'}
                    </span>
                    <span className="font-mono">Código: {cliente.referralCode}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {cliente.rewards.some((reward) => reward.status === 'available') && (
                    <Badge tone="accent">
                      {cliente.rewards.filter((reward) => reward.status === 'available').length} por
                      reclamar
                    </Badge>
                  )}
                  <Badge tone={cliente.suscripciones.length > 0 ? 'success' : 'neutral'}>
                    {cliente.suscripciones.length}{' '}
                    {cliente.suscripciones.length === 1 ? 'activa' : 'activas'}
                  </Badge>
                </div>
              </div>

              <CardContent className="p-4">
                {cliente.suscripciones.length === 0 ? (
                  <p className="text-sm text-[var(--color-content-muted)]">
                    Registrado el {formatDateTime(cliente.createdAt)}. Todavía no tiene ningún
                    perfil asignado.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {cliente.suscripciones.map((suscripcion) => (
                      <li
                        key={suscripcion.assignmentId}
                        className="flex items-center gap-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] p-3"
                      >
                        <span
                          aria-hidden
                          className="h-9 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: suscripcion.brandColor }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {suscripcion.serviceName} · {suscripcion.profileLabel}
                          </p>
                          <p className="truncate text-xs text-[var(--color-content-muted)]">
                            {suscripcion.accountLabel} ·{' '}
                            {suscripcion.expiresAt
                              ? `hasta el ${formatDateTime(suscripcion.expiresAt)}`
                              : 'sin vencimiento'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <AdminRewards userId={cliente.id} rewards={cliente.rewards} />

                {/* El borrado va al final y en tono discreto: es la acción menos
                    frecuente de esta tarjeta y la única irreversible. */}
                <div className="mt-4 flex justify-end border-t-2 border-[var(--color-border)] pt-3">
                  <DeleteClient
                    clientId={cliente.id}
                    nombre={cliente.fullName ?? cliente.email}
                    totalPedidos={cliente.totalPedidos}
                    totalAsignaciones={cliente.totalAsignaciones}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
