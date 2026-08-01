'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { updateProfileAction } from '../actions';

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

export function SettingsForm({
  fullName,
  phone,
}: {
  fullName: string | null;
  phone: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateProfileAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tus datos</CardTitle>
        <p className="text-sm text-[var(--color-content-muted)]">
          Nos sirven para avisarte cuando haga falta.
        </p>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Nombre</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={fullName ?? ''}
              placeholder="Ana García"
              autoComplete="name"
              error={state.fieldErrors?.fullName}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={phone ?? ''}
              placeholder="+506 8888 8888"
              autoComplete="tel"
              error={state.fieldErrors?.phone}
              hint="Lo usaremos para avisarte por WhatsApp cuando activemos ese canal."
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

          <BotonGuardar />
        </form>
      </CardContent>
    </Card>
  );
}
