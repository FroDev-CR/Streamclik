'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { saveWhatsappAction, skipWhatsappAction } from '../actions';

function BotonContinuar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full size="lg" disabled={pending}>
      {pending ? (
        'Guardando…'
      ) : (
        <>
          Continuar
          <ArrowRight aria-hidden className="size-4" strokeWidth={3} />
        </>
      )}
    </Button>
  );
}

/**
 * Paso posterior al registro: capturar el WhatsApp.
 *
 * Se pide aquí y no dentro del formulario de Clerk porque Clerk gestiona la
 * identidad —correo y contraseña—, no los datos del negocio. Meter un campo
 * propio en su formulario obligaría a usar su API de metadatos y tendríamos el
 * teléfono en dos sitios, con el riesgo de que dejen de coincidir.
 *
 * El número es el canal por el que se avisará y se cobrará, así que se pide
 * antes de dejar entrar. Se puede omitir —bloquear a alguien recién registrado
 * por un teléfono es peor que no tenerlo— pero la opción es deliberadamente
 * discreta.
 */
export function WhatsappOnboarding() {
  const [state, formAction] = useActionState<ActionState, FormData>(saveWhatsappAction, {});

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)]">
            <MessageCircle aria-hidden className="size-6" strokeWidth={2.5} />
          </span>

          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-none tracking-[-0.04em]">
            ¿Cuál es tu WhatsApp?
          </h1>

          <p className="text-sm leading-relaxed text-[var(--color-content-muted)]">
            Lo usamos para confirmarte los pagos y avisarte de cualquier cosa con tu suscripción.
            No lo compartimos con nadie.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Número de WhatsApp</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              // `autoFocus` aquí sí: es el único campo de la pantalla y el
              // usuario acaba de llegar con la intención de rellenarlo.
              autoFocus
              placeholder="+506 8888 8888"
              error={state.fieldErrors?.phone}
              required
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

          <BotonContinuar />
        </form>

        <form action={skipWhatsappAction}>
          <button
            type="submit"
            className="w-full text-xs text-[var(--color-content-muted)] underline underline-offset-4"
          >
            Ahora no, lo pongo después
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
