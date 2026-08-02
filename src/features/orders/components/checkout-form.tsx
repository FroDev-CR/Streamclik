'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, Paperclip, Send, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { crearPedidoAction } from '../actions';
import { formatMoney } from '../presentation';

/**
 * Pantalla de compra: pagar por SINPE y adjuntar el comprobante.
 *
 * El pago es manual a propósito. En Costa Rica SINPE Móvil es lo que la gente
 * usa, no cobra comisión y no exige alta de comercio; el coste es una revisión
 * humana por venta, asumible a este volumen. La estructura del flujo —pedido
 * confirmado → perfil asignado— es la misma que necesitará una pasarela cuando
 * llegue: sólo cambiará quién confirma.
 */

function BotonEnviar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full size="lg" disabled={pending}>
      {pending ? (
        'Enviando…'
      ) : (
        <>
          <Send aria-hidden className="size-4" strokeWidth={2.5} />
          Enviar comprobante
        </>
      )}
    </Button>
  );
}

/**
 * Copiar el número al portapapeles.
 *
 * Es el gesto central de la pantalla: el cliente tiene que pegarlo en su app
 * bancaria, y transcribir ocho dígitos a mano es donde se pierden los pagos.
 */
function BotonCopiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles (contexto no seguro o permiso denegado) el número sigue
      // visible y seleccionable: no hay nada que reportar al usuario.
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={copiar}>
      {copiado ? (
        <>
          <Check aria-hidden className="size-4" strokeWidth={3} />
          Copiado
        </>
      ) : (
        <>
          <Copy aria-hidden className="size-4" strokeWidth={2.5} />
          Copiar
        </>
      )}
    </Button>
  );
}

export interface CheckoutFormProps {
  serviceId: string;
  serviceName: string;
  brandColor: string;
  priceAmount: number;
  priceCurrency: string;
  sinpeNumber: string;
  sinpeName: string;
  instructions: string;
}

export function CheckoutForm({
  serviceId,
  serviceName,
  brandColor,
  priceAmount,
  priceCurrency,
  sinpeNumber,
  sinpeName,
  instructions,
}: CheckoutFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(crearPedidoAction, {});
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);

  const monto = formatMoney(priceAmount, priceCurrency);

  return (
    <div className="flex flex-col gap-5">
      {/* Paso 1 — cuánto y a dónde */}
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--color-border)] font-[family-name:var(--font-display)] text-lg font-black text-white"
            style={{ backgroundColor: brandColor }}
          >
            {serviceName.charAt(0)}
          </span>
          <div className="min-w-0">
            <CardTitle>{serviceName}</CardTitle>
            <p className="text-sm text-[var(--color-content-muted)]">
              {monto} al mes · un perfil sólo tuyo
            </p>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-4 py-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-[0.7rem] font-extrabold uppercase tracking-wider">
                Monto exacto
              </p>
              <p className="font-[family-name:var(--font-display)] text-3xl font-black leading-none">
                {monto}
              </p>
            </div>
            <Smartphone aria-hidden className="size-7 shrink-0" strokeWidth={2.5} />
          </div>

          {/* Sin número configurado no se puede pagar. Se dice en vez de mostrar
              un hueco vacío que parecería un fallo de carga. */}
          {sinpeNumber ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--color-border)] px-4 py-3">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-[0.7rem] font-extrabold uppercase tracking-wider text-[var(--color-content-muted)]">
                  SINPE Móvil
                </p>
                <p className="font-mono text-xl font-bold tracking-tight">{sinpeNumber}</p>
                {sinpeName && (
                  <p className="text-xs text-[var(--color-content-muted)]">
                    A nombre de {sinpeName}
                  </p>
                )}
              </div>
              <BotonCopiar valor={sinpeNumber} />
            </div>
          ) : (
            <p
              role="alert"
              className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--color-danger)]"
            >
              Todavía no hay un número de SINPE configurado. Escríbenos y te lo damos.
            </p>
          )}

          {instructions && (
            <p className="text-sm leading-relaxed text-[var(--color-content-muted)]">
              {instructions}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Paso 2 — el comprobante */}
      <Card>
        <CardHeader>
          <CardTitle>Adjunta tu comprobante</CardTitle>
          <p className="text-sm text-[var(--color-content-muted)]">
            La captura del SINPE. Lo verificamos y te soltamos la cuenta.
          </p>
        </CardHeader>

        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="serviceId" value={serviceId} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt">Captura del pago</Label>

              {/* El input real queda oculto pero accesible: el nativo muestra
                  «Sin archivos seleccionados» en un estilo que no hay forma de
                  tocar, y en móvil apenas se ve. La etiqueta hace de botón. */}
              <label
                htmlFor="receipt"
                className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-border)] px-4 py-5 transition-colors hover:bg-[var(--color-canvas)]"
              >
                <Paperclip aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {nombreArchivo ?? 'Tocar para elegir la imagen o el PDF'}
                </span>
              </label>

              <input
                id="receipt"
                name="receipt"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="sr-only"
                onChange={(evento) => setNombreArchivo(evento.target.files?.[0]?.name ?? null)}
              />

              {state.fieldErrors?.receipt && (
                <p className="text-xs font-semibold text-[var(--color-danger)]">
                  {state.fieldErrors.receipt}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note">Nota (opcional)</Label>
              <Input
                id="note"
                name="note"
                placeholder="Pagué desde el número de mi esposa"
                maxLength={280}
                error={state.fieldErrors?.note}
                hint="Cualquier cosa que nos ayude a identificar tu pago."
              />
            </div>

            {state.error && (
              <p
                role="alert"
                className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--color-danger)]"
              >
                {state.error}
              </p>
            )}

            <BotonEnviar />

            <p className="text-center text-xs text-[var(--color-content-muted)]">
              No te cobramos nada aquí. El pago lo haces desde tu banco y nosotros sólo verificamos
              la captura.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
