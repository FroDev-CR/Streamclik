'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/auth/actions';

import { createAccountAction } from '../actions';
import type { AdminServiceOption } from '../queries';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creando…' : 'Crear cuenta'}
    </Button>
  );
}

/** Alta de una cuenta de streaming en el inventario del operador. */
export function CreateAccountForm({ services }: { services: AdminServiceOption[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createAccountAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Añadir cuenta</CardTitle>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="serviceId">Servicio</Label>
            <select
              id="serviceId"
              name="serviceId"
              required
              className="h-10 rounded-lg border border-[--color-border-strong] bg-[--color-surface-raised] px-3 text-sm"
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Nombre interno</Label>
            <Input
              id="label"
              name="label"
              placeholder="Netflix 01"
              error={state.fieldErrors?.label}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inboxEmail">Correo de ingesta</Label>
            <Input
              id="inboxEmail"
              name="inboxEmail"
              type="email"
              placeholder="netflix1@streamclick.com"
              error={state.fieldErrors?.inboxEmail}
              required
            />
            <p className="text-xs text-[--color-content-subtle]">
              La dirección a la que Netflix enviará los códigos. Debe estar configurada en el
              proveedor de correo entrante.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loginEmail">Correo de acceso a Netflix</Label>
              <Input
                id="loginEmail"
                name="loginEmail"
                type="email"
                error={state.fieldErrors?.loginEmail}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loginPassword">Contraseña</Label>
              <Input
                id="loginPassword"
                name="loginPassword"
                type="password"
                // `new-password` evita que el gestor del navegador autorrellene
                // aquí las credenciales del administrador en StreamClick.
                autoComplete="new-password"
                error={state.fieldErrors?.loginPassword}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxProfiles">Número de perfiles</Label>
            <Input
              id="maxProfiles"
              name="maxProfiles"
              type="number"
              min={1}
              max={10}
              defaultValue={5}
              error={state.fieldErrors?.maxProfiles}
              required
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
              {state.success}
            </p>
          )}

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
