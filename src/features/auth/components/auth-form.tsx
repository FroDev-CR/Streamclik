'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

import type { ActionState } from '../actions';

/**
 * Formularios de autenticación.
 *
 * Son Client Components por una razón concreta: necesitan estado de envío
 * (`useActionState` / `useFormStatus`) para deshabilitar el botón y evitar el
 * doble envío. El resto de la pantalla de login es un Server Component.
 *
 * Al usarse como `action` de un `<form>`, siguen funcionando sin JavaScript: la
 * degradación es un envío de formulario normal.
 */

function SubmitButton({ label, pending: labelPending }: { label: string; pending: string }) {
  // `useFormStatus` debe leerse desde un componente hijo del <form>, no desde el
  // que lo declara: en el propio componente del formulario siempre devolvería
  // `pending: false`.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full disabled={pending}>
      {pending ? labelPending : label}
    </Button>
  );
}

interface AuthFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  mode: 'signin' | 'signup' | 'reset';
  nextPath?: string;
}

export function AuthForm({ action, mode, nextPath }: AuthFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      {mode === 'signup' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            placeholder="Ana García"
            error={state.fieldErrors?.fullName}
            required
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          error={state.fieldErrors?.email}
          required
        />
      </div>

      {mode !== 'reset' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            // El navegador propone una contraseña fuerte al registrarse y la
            // rellena al iniciar sesión sólo si el autocomplete es el correcto.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            error={state.fieldErrors?.password}
            required
          />
        </div>
      )}

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

      <SubmitButton
        label={mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
        pending={mode === 'signin' ? 'Entrando…' : mode === 'signup' ? 'Creando…' : 'Enviando…'}
      />
    </form>
  );
}
