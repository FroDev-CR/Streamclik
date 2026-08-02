'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { guardarDatosPagoAction } from '../actions';
import type { PaymentSettings } from '../queries';

/**
 * Datos de cobro que ve el cliente al comprar.
 *
 * Están en la base de datos y no en variables de entorno porque el operador
 * trabaja desde el móvil: cambiar el número de SINPE tiene que ser un formulario
 * y no un redespliegue.
 */

function BotonGuardar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        'Guardando…'
      ) : (
        <>
          <Save aria-hidden className="size-4" strokeWidth={2.5} />
          Guardar
        </>
      )}
    </Button>
  );
}

export function PaymentSettingsForm({ settings }: { settings: PaymentSettings }) {
  const [state, formAction] = useActionState<ActionState, FormData>(guardarDatosPagoAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de cobro</CardTitle>
        <p className="text-sm text-[var(--color-content-muted)]">
          Es lo que el cliente ve en la pantalla de compra.
        </p>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sinpeNumber">Número SINPE</Label>
              <Input
                id="sinpeNumber"
                name="sinpeNumber"
                type="tel"
                defaultValue={settings.sinpeNumber}
                placeholder="8888 8888"
                error={state.fieldErrors?.sinpeNumber}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sinpeName">A nombre de</Label>
              <Input
                id="sinpeName"
                name="sinpeName"
                defaultValue={settings.sinpeName}
                placeholder="Andrés G."
                error={state.fieldErrors?.sinpeName}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instructions">Instrucciones</Label>
            <Input
              id="instructions"
              name="instructions"
              defaultValue={settings.instructions}
              maxLength={400}
              error={state.fieldErrors?.instructions}
              hint="Una frase corta. Aparece debajo del número, antes de subir el comprobante."
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

          {state.success && (
            <p
              role="status"
              className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2 text-sm font-semibold"
            >
              {state.success}
            </p>
          )}

          <div>
            <BotonGuardar />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
