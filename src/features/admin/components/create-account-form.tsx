'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowRight, AtSign, KeyRound, Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { createAccountAction } from '../actions';
import type { AdminServiceOption } from '../queries';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full size="lg" disabled={pending}>
      {pending ? (
        'Creando…'
      ) : (
        <>
          <Plus aria-hidden className="size-4" strokeWidth={3} />
          Crear cuenta
        </>
      )}
    </Button>
  );
}

/** Encabezado de bloque dentro del formulario, con su número de paso. */
function Paso({ n, titulo, icono: Icono }: { n: number; titulo: string; icono: typeof AtSign }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] font-[family-name:var(--font-display)] text-xs font-black">
        {n}
      </span>
      <span className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-wider">
        <Icono aria-hidden className="size-3.5" strokeWidth={2.5} />
        {titulo}
      </span>
    </div>
  );
}

/**
 * Alta de una cuenta de streaming en el inventario del operador.
 *
 * El formulario se divide en pasos numerados en lugar de ser una lista plana de
 * ocho campos: la mitad son datos de Netflix y la otra mitad de StreamClick, y
 * mezclarlos era la causa de que el campo decisivo —el correo de ingesta— se
 * confundiera con el de acceso.
 */
export function CreateAccountForm({ services }: { services: AdminServiceOption[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createAccountAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Limpiar tras el alta evita el error más probable del panel: crear la
  // siguiente cuenta con los datos de la anterior todavía en pantalla y acabar
  // con dos cuentas casi idénticas.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const sinServicios = services.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Añadir cuenta</CardTitle>
      </CardHeader>

      <CardContent>
        {sinServicios ? (
          <p className="rounded-xl border-2 border-[var(--color-warning)] bg-[var(--color-warning)]/10 px-3 py-2 text-sm">
            No hay servicios en el catálogo. Revisa que la semilla se aplicara al instalar el
            esquema.
          </p>
        ) : (
          <form ref={formRef} action={formAction} className="flex flex-col gap-6">
            {/* ---------------------------------------------------------- 1 */}
            <div className="flex flex-col gap-3">
              <Paso n={1} titulo="Identificación" icono={Users} />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="serviceId">Servicio</Label>
                <Select id="serviceId" name="serviceId" required error={state.fieldErrors?.serviceId}>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label">Nombre interno</Label>
                <Input
                  id="label"
                  name="label"
                  placeholder="Netflix 01"
                  error={state.fieldErrors?.label}
                  hint="Sólo lo ves tú, para distinguir esta cuenta de las demás."
                  required
                />
              </div>
            </div>

            {/* ---------------------------------------------------------- 2 */}
            {/* El correo de ingesta va destacado a propósito: es el único campo
                que debe coincidir con la configuración de Cloudflare, y si no
                coincide los códigos se pierden en silencio. */}
            <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4">
              <Paso n={2} titulo="Correo de ingesta" icono={AtSign} />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inboxEmail" className="sr-only">
                  Correo de ingesta
                </Label>
                <Input
                  id="inboxEmail"
                  name="inboxEmail"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="netflix1@streamclick.xyz"
                  error={state.fieldErrors?.inboxEmail}
                  hint="La dirección donde Netflix enviará los códigos. Debe estar en tu dominio y cubierta por la regla catch-all de Cloudflare."
                  required
                />
              </div>
            </div>

            {/* ---------------------------------------------------------- 3 */}
            <div className="flex flex-col gap-3">
              <Paso n={3} titulo="Acceso al servicio" icono={KeyRound} />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loginEmail">Correo de la cuenta de Netflix</Label>
                <Input
                  id="loginEmail"
                  name="loginEmail"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
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
                  hint="Se cifra antes de guardarse. La verán los clientes con perfil asignado."
                  required
                />
              </div>
            </div>

            {/* ---------------------------------------------------------- 4 */}
            <div className="flex flex-col gap-3">
              <Paso n={4} titulo="Inventario" icono={Users} />

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
                  hint="Se crean los slots vendibles de una vez. Netflix estándar: 5."
                  required
                />
              </div>
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
              <div
                role="status"
                className="flex flex-col gap-2 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2.5"
              >
                <p className="text-sm font-semibold">{state.success}</p>
                {/* El alta deja al operador donde estaba, así que el enlace de
                    vuelta es explícito: lo normal tras crear una cuenta es ir a
                    asignarle un perfil, y eso ocurre en el banco. */}
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 text-xs font-bold underline underline-offset-4"
                >
                  Ver el banco de cuentas
                  <ArrowRight aria-hidden className="size-3.5" strokeWidth={3} />
                </Link>
              </div>
            )}

            <SubmitButton />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
