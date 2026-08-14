'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCheck, Paperclip, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { crearReporteAction } from '../actions';
import type { ReportableAccount } from '../queries';

/**
 * Reportar un problema con una cuenta.
 *
 * El desplegable de cuentas es lo que hace útil el reporte: por WhatsApp el
 * cliente escribe «no me sirve Netflix» y hay que preguntarle cuál de sus
 * perfiles, en qué cuenta y desde cuándo. Aquí eso ya viene resuelto.
 *
 * Las capturas son opcionales a propósito. Quien reporta lo hace casi siempre
 * desde el televisor, con el móvil en la mano y sin ganas de recortar nada;
 * exigirlas convertiría el formulario en un obstáculo y volveríamos al WhatsApp.
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
          Enviar reporte
        </>
      )}
    </Button>
  );
}

export function ReportForm({ accounts }: { accounts: ReportableAccount[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(crearReporteAction, {});
  const [nombres, setNombres] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setNombres([]);
    }
  }, [state.success]);

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="font-[family-name:var(--font-display)] text-base font-black uppercase">
            Todavía no tienes cuentas
          </p>
          <p className="max-w-xs text-sm text-[var(--color-content-muted)]">
            Cuando tengas una suscripción activa vas a poder reportar cualquier problema desde aquí.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reportar un problema</CardTitle>
        <p className="text-sm text-[var(--color-content-muted)]">
          Cuéntanos qué pasa y lo revisamos. Si puedes, adjunta una captura.
        </p>
      </CardHeader>

      <CardContent>
        {state.success ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2.5 text-sm font-semibold"
          >
            <CheckCheck aria-hidden className="size-4" strokeWidth={2.5} />
            {state.success}
          </p>
        ) : null}

        <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignmentId">¿Cuál cuenta?</Label>
            <Select
              id="assignmentId"
              name="assignmentId"
              required
              defaultValue=""
              error={state.fieldErrors?.assignmentId}
            >
              <option value="" disabled>
                Elige una de tus cuentas
              </option>
              {accounts.map((cuenta) => (
                <option key={cuenta.assignmentId} value={cuenta.assignmentId}>
                  {cuenta.serviceName} · {cuenta.profileLabel}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">¿Qué está pasando?</Label>
            <textarea
              id="reason"
              name="reason"
              required
              rows={5}
              maxLength={1000}
              placeholder="Me pide un PIN que no es el mío, me saca al entrar…"
              className="w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-content)] placeholder:text-[var(--color-content-subtle)] focus:-translate-y-[1px] focus:shadow-[3px_3px_0_var(--color-border)] focus:outline-none"
            />
            {state.fieldErrors?.reason && (
              <p className="text-xs font-semibold text-[var(--color-danger)]">
                {state.fieldErrors.reason}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="screenshots">Capturas (opcional, hasta 3)</Label>

            <label
              htmlFor="screenshots"
              className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-border)] px-4 py-5 transition-colors hover:bg-[var(--color-canvas)]"
            >
              <Paperclip aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {nombres.length > 0 ? nombres.join(', ') : 'Tocar para elegir imágenes'}
              </span>
            </label>

            <input
              id="screenshots"
              name="screenshots"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="sr-only"
              onChange={(evento) =>
                setNombres(Array.from(evento.target.files ?? []).map((archivo) => archivo.name))
              }
            />

            {state.fieldErrors?.screenshots && (
              <p className="text-xs font-semibold text-[var(--color-danger)]">
                {state.fieldErrors.screenshots}
              </p>
            )}
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
  );
}
