'use client';

import { useActionState, useState } from 'react';
import { CheckCircle2, CloudDownload, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CuentaDeGoPlay } from '@/features/admin/goplay-queries';
import type { AdminServiceOption } from '@/features/admin/queries';
import type { ActionState } from '@/features/shared/action-state';

import { importarDeGoPlayAction } from '../actions';

/**
 * Importar al banco lo que ya está comprado en GoPlay.
 *
 * Cada tarjeta es una cuenta de su inventario. Las ya importadas se siguen
 * mostrando, en gris: sirven para ver de un vistazo qué falta por cargar, que es
 * la pregunta que uno se hace al entrar aquí.
 *
 * El servicio viene deducido del nombre del producto, pero el operador puede
 * cambiarlo. Adivinar mal metería una cuenta de Disney en el catálogo de
 * Netflix, y eso no se descubre hasta que un cliente se queda sin su código.
 */

function FilaDeCuenta({
  cuenta,
  servicios,
}: {
  cuenta: CuentaDeGoPlay;
  servicios: AdminServiceOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    importarDeGoPlayAction,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  const nombreSugerido = cuenta.producto.split(/\s+/).slice(0, 2).join(' ') || 'Cuenta';

  if (cuenta.yaImportada) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3 opacity-60">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cuenta.producto}</p>
          <p className="truncate text-xs text-[var(--color-content-subtle)]">{cuenta.correo}</p>
        </div>
        <Badge tone="success" className="shrink-0">
          <CheckCircle2 aria-hidden className="size-3" />
          En el banco
        </Badge>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cuenta.producto}</p>
          <p className="truncate text-xs text-[var(--color-content-subtle)]">
            {cuenta.correo}
            {cuenta.renuevaEl ? ` · renueva el ${cuenta.renuevaEl}` : ''}
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Cancelar' : 'Importar'}
        </Button>
      </div>

      {!cuenta.admiteConsulta && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-content-subtle)]">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          GoPlay no ofrece consulta de correo para esta cuenta: sus códigos habrá que pedirlos a mano.
        </p>
      )}

      {abierto && (
        <form action={formAction} className="mt-3 flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
          <input type="hidden" name="providerProfileId" value={cuenta.id} />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              Nombre en tu banco
              <input
                name="label"
                defaultValue={nombreSugerido}
                required
                className="rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              Servicio
              <select
                name="serviceId"
                defaultValue={cuenta.serviceId ?? ''}
                required
                className="rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
              >
                <option value="">Elegí uno…</option>
                {servicios.map((servicio) => (
                  <option key={servicio.id} value={servicio.id}>
                    {servicio.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              Perfiles
              <input
                name="maxProfiles"
                type="number"
                min={1}
                max={10}
                defaultValue={5}
                required
                className="rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {!cuenta.serviceId && (
            <p className="text-xs text-[var(--color-content-subtle)]">
              No reconocí el servicio a partir del nombre del producto. Elegilo vos.
            </p>
          )}

          {state.error && <p className="text-xs text-[var(--color-danger)]">{state.error}</p>}
          {state.success && <p className="text-xs text-[var(--color-success)]">{state.success}</p>}

          <Button type="submit" disabled={pending} size="sm" className="self-start">
            {pending ? 'Importando…' : 'Crear en el banco'}
          </Button>
        </form>
      )}
    </div>
  );
}

export function GoPlayImport({
  cuentas,
  servicios,
  error,
}: {
  cuentas: CuentaDeGoPlay[];
  servicios: AdminServiceOption[];
  error: string | null;
}) {
  const pendientes = cuentas.filter((cuenta) => !cuenta.yaImportada).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudDownload aria-hidden className="size-4" />
          Inventario en GoPlay
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {error && (
          <p className="rounded-lg border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        {!error && cuentas.length === 0 && (
          <p className="text-sm text-[var(--color-content-subtle)]">
            No hay ninguna cuenta comprada en GoPlay.
          </p>
        )}

        {cuentas.length > 0 && (
          <p className="text-sm text-[var(--color-content-subtle)]">
            {pendientes === 0
              ? 'Todo lo que tenés comprado ya está en el banco.'
              : `${pendientes} cuenta(s) por dar de alta.`}
          </p>
        )}

        {cuentas.map((cuenta) => (
          <FilaDeCuenta key={cuenta.id} cuenta={cuenta} servicios={servicios} />
        ))}
      </CardContent>
    </Card>
  );
}
