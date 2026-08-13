'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCheck, ExternalLink, Inbox, MessageCircle, RefreshCw, Rocket, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PlatformIcon } from '@/components/platform-icon';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

import { aprobarRenovacionAction, rechazarPedidoAction, soltarCuentaAction } from '../actions';
import type { AdminOrderRow } from '../queries';
import { formatMoney, whatsappLink } from '../presentation';

/**
 * Cola de pagos por revisar.
 *
 * Está construida alrededor de un solo gesto: mirar el comprobante y pulsar
 * «Soltar cuenta». El operador no elige qué perfil entrega —el sistema coge el
 * primero libre de esa plataforma—, porque elegirlo a mano no aporta nada y es
 * justo el paso que hace que una venta tarde cinco minutos en lugar de cinco
 * segundos.
 */

function BotonSoltar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? (
        'Soltando…'
      ) : (
        <>
          <Rocket aria-hidden className="size-4" strokeWidth={2.5} />
          Soltar compra
        </>
      )}
    </Button>
  );
}

function BotonRenovar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? (
        'Renovando…'
      ) : (
        <>
          <RefreshCw aria-hidden className="size-4" strokeWidth={2.5} />
          Aprobar renovación
        </>
      )}
    </Button>
  );
}

/** Rechazo con nota. La nota se muestra al cliente en su historial. */
function FormularioRechazo({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(rechazarPedidoAction, {});
  const [abierto, setAbierto] = useState(false);
  const idNota = `nota-rechazo-${orderId}`;

  if (state.success) {
    return (
      <p role="status" className="text-xs font-semibold text-[var(--color-content-muted)]">
        {state.success}
      </p>
    );
  }

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        <X aria-hidden className="size-4" strokeWidth={2.5} />
        Rechazar
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />

      <Label htmlFor={idNota}>Motivo (lo verá el cliente)</Label>
      <Input
        id={idNota}
        name="note"
        placeholder="El monto no coincide"
        maxLength={280}
        error={state.error}
      />

      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm">
          Confirmar rechazo
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Volver
        </Button>
      </div>
    </form>
  );
}

function PedidoPendiente({ order }: { order: AdminOrderRow }) {
  // Una renovación extiende la asignación que el cliente ya tiene; una compra
  // entrega un perfil libre. Son funciones distintas de base de datos y aprobar
  // una con la otra le cambiaría el perfil al cliente, que es justo lo que
  // renovar existe para evitar.
  const [state, formAction] = useActionState<ActionState, FormData>(
    order.isRenewal ? aprobarRenovacionAction : soltarCuentaAction,
    {},
  );

  // Entregado en esta misma sesión: la tarjeta se queda para confirmar qué pasó,
  // en lugar de desaparecer y dejar al operador dudando si pulsó bien.
  const resuelto = Boolean(state.success);

  return (
    <Card className={resuelto ? 'opacity-70' : undefined}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-white">
              <PlatformIcon iconKey={order.iconKey} name={order.serviceName} className="size-6" />
            </span>

            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                {order.serviceName}
                {/* Distinguirlas de un vistazo importa: el gesto de aprobar es
                    distinto y el resultado para el cliente también. */}
                {order.isRenewal && <Badge tone="accent">Renovación</Badge>}
              </p>
              <p className="truncate text-xs text-[var(--color-content-muted)]">
                {order.userName ? `${order.userName} · ` : ''}
                {order.userEmail}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-[family-name:var(--font-display)] text-xl font-black leading-none">
              {formatMoney(order.priceAmount, order.priceCurrency)}
            </p>
            {order.submittedAt && (
              <p className="mt-1 text-xs text-[var(--color-content-muted)]">
                {formatRelativeTime(order.submittedAt)}
              </p>
            )}
          </div>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {order.items.map((item) => (
            <li
              key={`${item.productType}:${item.slug}`}
              className="flex items-center gap-2 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2"
            >
              <PlatformIcon iconKey={item.iconKey} name={item.name} className="size-5" />
              <span className="min-w-0 flex-1 truncate text-xs font-bold">{item.name}</span>
              <Badge tone="neutral">×{item.quantity}</Badge>
            </li>
          ))}
        </ul>

        {order.receiptNote && (
          <p className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-xs">
            <span className="font-bold uppercase">Nota del cliente: </span>
            {order.receiptNote}
          </p>
        )}

        {order.referralCode && (
          <p className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2 text-xs">
            <span className="font-bold uppercase">Código de invitación: </span>
            <span className="font-mono">{order.referralCode}</span>. La recompensa se acreditará al
            aprobar esta compra.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* El comprobante se abre con una URL firmada de diez minutos, no desde
              un bucket público: lleva nombre, teléfono e importe. */}
          {order.receiptUrl ? (
            <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary" size="sm">
                <ExternalLink aria-hidden className="size-4" strokeWidth={2.5} />
                Ver comprobante
              </Button>
            </a>
          ) : (
            <Badge tone="danger">Sin comprobante</Badge>
          )}

          {order.userPhone && (
            <a href={whatsappLink(order.userPhone)} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="ghost" size="sm">
                <MessageCircle aria-hidden className="size-4" strokeWidth={2.5} />
                {order.userPhone}
              </Button>
            </a>
          )}

          <span className="text-xs text-[var(--color-content-muted)]">
            Pedido del {formatDateTime(order.createdAt)}
          </span>
        </div>

        {state.error && (
          <p
            role="alert"
            className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--color-danger)]"
          >
            {state.error}
          </p>
        )}

        {state.success ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2 text-sm font-semibold"
          >
            <CheckCheck aria-hidden className="size-4" strokeWidth={2.5} />
            {state.success}
          </p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3 border-t-2 border-[var(--color-border)] pt-4">
            <form action={formAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="orderId" value={order.id} />

              {/* En una renovación no se elige fecha: son 30 días sumados a lo
                  que le quedaba, y calcularlo a mano es justo donde se cometen
                  los errores que le regalan o le quitan tiempo al cliente. */}
              {order.isRenewal ? (
                <BotonRenovar />
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`vence-${order.id}`}>Vence (opcional)</Label>
                    <Input
                      id={`vence-${order.id}`}
                      name="expiresAt"
                      type="date"
                      className="h-9 w-40 text-xs"
                    />
                  </div>

                  <BotonSoltar />
                </>
              )}
            </form>

            <FormularioRechazo orderId={order.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PaymentReview({ orders }: { orders: AdminOrderRow[] }) {
  if (orders.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Inbox aria-hidden className="size-8" strokeWidth={2} />
        <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase">
          Nada por revisar
        </p>
        <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
          Cuando un cliente envíe su comprobante aparecerá aquí para que lo verifiques y sueltes la
          cuenta.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <PedidoPendiente key={order.id} order={order} />
      ))}
    </div>
  );
}
