'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Paperclip, Receipt, Upload, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime } from '@/lib/utils';

import { cancelarPedidoAction, subirComprobanteAction } from '../actions';
import type { OrderRow } from '../queries';
import { ORDER_STATUS, formatMoney } from '../presentation';

/**
 * Historial de compras del cliente.
 *
 * Cada pedido cuenta su propia historia completa: qué compró, cuánto pagó, en
 * qué estado está y qué le toca hacer ahora. Es lo que evita el mensaje de
 * «¿ya llegó mi pago?» un cuarto de hora después de enviarlo.
 */

function BotonSubir() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        'Enviando…'
      ) : (
        <>
          <Upload aria-hidden className="size-4" strokeWidth={2.5} />
          Enviar
        </>
      )}
    </Button>
  );
}

/** Adjuntar el comprobante que faltó, o reemplazar el equivocado. */
function FormularioComprobante({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(subirComprobanteAction, {});
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const idCampo = `comprobante-${orderId}`;

  if (state.success) {
    return (
      <p role="status" className="text-xs font-semibold text-[var(--color-content)]">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />

      <label
        htmlFor={idCampo}
        className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-[var(--color-canvas)]"
      >
        <Paperclip aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
        <span className="min-w-0 flex-1 truncate">{nombreArchivo ?? 'Elegir captura o PDF'}</span>
      </label>

      <input
        id={idCampo}
        name="receipt"
        type="file"
        required
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="sr-only"
        onChange={(evento) => setNombreArchivo(evento.target.files?.[0]?.name ?? null)}
      />

      {(state.error || state.fieldErrors?.receipt) && (
        <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
          {state.error ?? state.fieldErrors?.receipt}
        </p>
      )}

      <BotonSubir />
    </form>
  );
}

/** Desistir de un pedido que aún nadie ha revisado. */
function BotonCancelar({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(cancelarPedidoAction, {});
  const [confirmando, setConfirmando] = useState(false);

  if (state.success) return null;

  if (!confirmando) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
        <X aria-hidden className="size-4" strokeWidth={2.5} />
        Cancelar pedido
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <span className="text-xs font-semibold">¿Seguro?</span>
      <Button type="submit" variant="danger" size="sm">
        Sí, cancelar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
        No
      </Button>
    </form>
  );
}

function PedidoCard({ order }: { order: OrderRow }) {
  const presentacion = ORDER_STATUS[order.status];
  const pendiente = order.status === 'esperando_revision';
  const faltaComprobante = order.status === 'esperando_comprobante';

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--color-border)] font-[family-name:var(--font-display)] font-black text-white"
              style={{ backgroundColor: order.brandColor }}
            >
              {order.serviceName.charAt(0)}
            </span>

            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                {order.serviceName}
              </p>
              <p className="text-xs text-[var(--color-content-muted)]">
                {formatMoney(order.priceAmount, order.priceCurrency)} ·{' '}
                {formatDateTime(order.createdAt)}
              </p>
            </div>
          </div>

          <Badge tone={presentacion.tono}>
            {/* El punto latiendo sólo mientras se espera: es lo que distingue de
                un vistazo un pedido en curso de uno ya cerrado. */}
            {pendiente && (
              <i
                aria-hidden
                className="size-1.5 animate-pulse rounded-full bg-[var(--color-surface)]"
              />
            )}
            {presentacion.etiqueta}
          </Badge>
        </div>

        <p className="text-sm leading-relaxed text-[var(--color-content-muted)]">
          {presentacion.detalle}
        </p>

        {order.reviewNote && (
          <p className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-xs">
            <span className="font-bold uppercase">Nota nuestra: </span>
            {order.reviewNote}
          </p>
        )}

        {faltaComprobante && <FormularioComprobante orderId={order.id} />}

        {(pendiente || faltaComprobante) && <BotonCancelar orderId={order.id} />}
      </CardContent>
    </Card>
  );
}

export function OrderHistory({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Receipt aria-hidden className="size-8" strokeWidth={2} />
        <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase">
          Todavía no has comprado nada
        </p>
        <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
          Cuando pidas un perfil aparecerá aquí con su estado, desde que envías el comprobante hasta
          que te soltamos la cuenta.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <PedidoCard key={order.id} order={order} />
      ))}
    </div>
  );
}
