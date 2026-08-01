import type { Metadata } from 'next';
import { AlertTriangle, Boxes, Sparkles, UserCheck } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { AccountInventory } from '@/features/admin/components/account-inventory';
import { CreateAccountForm } from '@/features/admin/components/create-account-form';
import { getAdminAccounts, getClientOptions, getServiceOptions } from '@/features/admin/queries';

export const metadata: Metadata = { title: 'Administración' };

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
 * Panel del operador: inventario de cuentas y asignación de perfiles.
 *
 * `requireAdmin()` redirige a quien no tenga el rol. Es defensa en profundidad:
 * las políticas RLS de `streaming_accounts` y `profile_assignments` ya exigen
 * `is_admin()`, así que un cliente que llegara hasta aquí vería el inventario
 * vacío en lugar de datos ajenos.
 */
export default async function AdminPage() {
  await requireAdmin();

  // Las tres consultas son independientes: en paralelo para no encadenar sus
  // latencias.
  const [servicios, clientes, inventario] = await Promise.all([
    getServiceOptions(),
    getClientOptions(),
    getAdminAccounts(),
  ]);

  // Los fallos de consulta se muestran en pantalla en lugar de degradar a una
  // lista vacía. Un inventario vacío por error es indistinguible de un
  // inventario vacío de verdad, y esa ambigüedad fue exactamente la que hizo que
  // "la cuenta se crea pero no aparece" resultara imposible de diagnosticar.
  const fallos = [servicios.error, clientes.error, inventario.error].filter(
    (mensaje): mensaje is string => Boolean(mensaje),
  );

  const cuentas = inventario.data;
  const perfiles = cuentas.flatMap((cuenta) => cuenta.profiles);
  const asignados = perfiles.filter((perfil) => perfil.assignment !== null).length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Sparkles aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Administración
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Da de alta las cuentas que revendes y reparte sus perfiles entre tus clientes. Cada
          cuenta necesita su propio correo de ingesta.
        </p>
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
          <p className="mt-2 text-xs text-[var(--color-content-muted)]">
            Lo que se muestra debajo puede estar incompleto. El detalle completo está en los logs
            del servidor.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metrica icono={Boxes} valor={cuentas.length} etiqueta="Cuentas" />
        <Metrica icono={UserCheck} valor={asignados} etiqueta="Perfiles asignados" />
        <Metrica
          icono={Sparkles}
          valor={perfiles.length - asignados}
          etiqueta="Perfiles libres"
          destacado={perfiles.length - asignados > 0}
        />
      </div>

      {/* El formulario queda fijo a la izquierda en escritorio: dar de alta
          varias cuentas seguidas es la tarea repetitiva del operador, y no
          debería tener que subir hasta arriba entre una y otra. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-28">
          <CreateAccountForm services={servicios.data} />
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-wider text-[var(--color-content-muted)]">
            Inventario ({cuentas.length})
          </h2>
          <AccountInventory accounts={cuentas} clients={clientes.data} />
        </section>
      </div>
    </div>
  );
}
