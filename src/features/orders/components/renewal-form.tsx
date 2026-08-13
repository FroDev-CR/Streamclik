'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, Paperclip, RefreshCw, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PlatformIcon } from '@/components/platform-icon';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime } from '@/lib/utils';

import { crearRenovacionAction } from '../actions';
import { formatMoney } from '../presentation';
import type { RenovacionInfo } from '../queries';

/**
 * Pantalla de renovación.
 *
 * Es casi la de compra, pero con una diferencia que conviene tener presente al
 * tocarla: aquí **no se entrega nada nuevo**. El cliente conserva su perfil, su
 * PIN y sus credenciales, y lo único que cambia es la fecha. Por eso la pantalla
 * enseña qué se renueva y hasta cuándo llega, en vez de hablar de «tu cuenta».
 *
 * Los treinta días se suman a lo que quedaba, así que renovar tres días antes no
 * regala ni quita tiempo. Se dice explícitamente porque es la duda que aparece
 * al pagar antes de tiempo.
 */

function BotonEnviar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full size="lg" disabled={pending}>
      {pending ? (
        'Enviando…'
      ) : (
        <>
          <RefreshCw aria-hidden className="size-4" strokeWidth={2.5} />
          Enviar comprobante
        </>
      )}
    </Button>
  );
}

function BotonCopiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles el número sigue visible y seleccionable.
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={copiar}>
      {copiado ? (
        <>
          <Check aria-hidden className="size-4" strokeWidth={2.5} />
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

export function RenewalForm({
  info,
  sinpeNumber,
  sinpeName,
  instructions,
}: {
  info: RenovacionInfo;
  sinpeNumber: string;
  sinpeName: string;
  instructions: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(crearRenovacionAction, {});
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);

  const monto = formatMoney(info.priceAmount, info.priceCurrency);
  const vencido = info.expiresAt ? new Date(info.expiresAt).getTime() <= Date.now() : false;

  // Ya hay una renovación esperando revisión: dejar crear otra sólo produce dos
  // pedidos por el mismo mes y al operador la duda de cuál aprobar.
  if (info.renovacionEnCurso) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <RefreshCw aria-hidden className="size-8" strokeWidth={2} />
          <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase">
            Ya tienes una renovación en camino
          </p>
          <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
            Estamos comprobando tu pago. En cuanto lo verifiquemos te extendemos la fecha; no hace
            falta que pagues otra vez.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-white"
          >
            <PlatformIcon iconKey={info.iconKey} name={info.serviceName} className="size-7" />
          </span>
          <div className="min-w-0">
            <CardTitle>{info.serviceName}</CardTitle>
            <p className="text-sm text-[var(--color-content-muted)]">
              {info.accountLabel} · {info.profileLabel}
            </p>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <p className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-3 text-sm">
            {info.expiresAt ? (
              vencido ? (
                <>
                  Tu suscripción <strong>venció</strong> el {formatDateTime(info.expiresAt)}. Al
                  renovar recuperas <strong>el mismo perfil</strong>, con su PIN y sus datos de
                  acceso.
                </>
              ) : (
                <>
                  Vence el <strong>{formatDateTime(info.expiresAt)}</strong>. Los 30 días se
                  <strong> suman</strong> a lo que te queda, así que no pierdes nada por pagar
                  antes.
                </>
              )
            ) : (
              <>Al renovar sumas 30 días a tu suscripción.</>
            )}
          </p>

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

          {sinpeNumber ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--color-border)] px-4 py-3">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-[0.7rem] font-extrabold uppercase tracking-wider text-[var(--color-content-muted)]">
                  SINPE Móvil
                </p>
                <p className="font-mono text-xl font-bold tracking-tight">{sinpeNumber}</p>
                {sinpeName && (
                  <p className="text-xs text-[var(--color-content-muted)]">A nombre de {sinpeName}</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Adjunta tu comprobante</CardTitle>
          <p className="text-sm text-[var(--color-content-muted)]">
            La captura del SINPE. Lo verificamos y te extendemos la fecha.
          </p>
        </CardHeader>

        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="assignmentId" value={info.assignmentId} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt">Captura del pago</Label>

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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
