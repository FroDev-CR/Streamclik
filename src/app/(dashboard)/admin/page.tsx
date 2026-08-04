import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Boxes, Plus, Sparkles, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/features/auth/session';
import { AccountBank } from '@/features/admin/components/account-bank';
import { getAdminAccounts, getClientOptions, getServiceOptions } from '@/features/admin/queries';

export const metadata: Metadata = { title: 'Banco de cuentas' };

/** Contador de un vistazo. */
function Metrica({
  icono: Icono,
  valor,
  etiqueta,
  destacado = false,
}: {
  icono: typeof Boxes;
  valor: number;
  etiqueta: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border-[3px] border-[var(--color-border)] p-4 shadow-[5px_5px_0_var(--color-border)] ${
        destacado ? 'bg-[var(--color-brand-yellow)]' : 'bg-[var(--color-surface)]'
      }`}
    >
      <Icono aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
      <div className="min-w-0">
        <p className="font-[family-name:var(--font-display)] text-2xl font-black leading-none">
          {valor}
        </p>
        <p className="mt-1 truncate text-xs font-semibold uppercase tracking-wide text-[var(--color-content-muted)]">
          {etiqueta}
        </p>
      </div>
    </div>
  );
}

/**
 * Banco de cuentas — vista principal del operador.
 *
 * El alta se movió a `/admin/nueva`: se usa una vez por compra, mientras que
 * consultar el inventario es lo que se hace a diario. Tenerla aquí ocupaba media
 * pantalla permanentemente para una tarea ocasional.
 */
export default async function AdminPage() {
  await requireAdmin();

  const [clientes, inventario, servicios] = await Promise.all([
    getClientOptions(),
    getAdminAccounts(),
    // En edición también se muestra la plataforma actual aunque se haya ocultado del catálogo.
    getServiceOptions(true),
  ]);

  // Los fallos de consulta se muestran en pantalla en lugar de degradar a una
  // lista vacía: un inventario vacío por error es indistinguible de uno vacío de
  // verdad, y esa ambigüedad hizo que "la cuenta se crea pero no aparece"
  // resultara imposible de diagnosticar.
  const fallos = [clientes.error, inventario.error, servicios.error].filter(
    (mensaje): mensaje is string => Boolean(mensaje),
  );

  const cuentas = inventario.data;
  const perfiles = cuentas.flatMap((cuenta) => cuenta.profiles);
  const ocupados = perfiles.filter((perfil) => perfil.assignment !== null).length;
  const libres = perfiles.length - ocupados;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
            <Sparkles aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
            Panel de operación
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
            Banco de cuentas
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
            Todo tu inventario: qué cuentas tienes, qué perfiles están ocupados y cuáles quedan
            libres para vender.
          </p>
        </div>

        <Link href="/admin/nueva">
          <Button size="lg">
            <Plus aria-hidden className="size-4" strokeWidth={3} />
            Añadir cuenta
          </Button>
        </Link>
      </header>

      {fallos.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar todos los datos
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {fallos.map((mensaje) => (
              <li key={mensaje} className="font-mono text-xs text-[var(--color-content)]">
                {mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metrica icono={Boxes} valor={cuentas.length} etiqueta="Cuentas" />
        <Metrica icono={UserCheck} valor={ocupados} etiqueta="Perfiles ocupados" />
        <Metrica icono={Sparkles} valor={libres} etiqueta="Perfiles libres" destacado={libres > 0} />
      </div>

      <AccountBank accounts={cuentas} clients={clientes.data} services={servicios.data} />
    </div>
  );
}
