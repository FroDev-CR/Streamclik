import type { Metadata } from 'next';
import { AlertTriangle, Users } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { ClientDirectory } from '@/features/admin/components/client-directory';
import { getAdminClients } from '@/features/admin/queries';

export const metadata: Metadata = { title: 'Clientes' };

/**
 * Clientes — la vista inversa del banco.
 *
 * El banco parte del inventario y pregunta quién lo ocupa; esta pantalla parte
 * de la persona y pregunta qué tiene contratado. El operador necesita las dos:
 * una para vender el hueco libre, otra para atender a quien le escribe.
 */
export default async function ClientesPage() {
  await requireAdmin();

  const clientes = await getAdminClients();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Users aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Clientes
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Quién te ha comprado y qué tiene activo ahora mismo.
        </p>
      </header>

      {clientes.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudo cargar la lista
          </p>
          <p className="mt-2 font-mono text-xs">{clientes.error}</p>
        </div>
      )}

      <ClientDirectory clients={clientes.data} />
    </div>
  );
}
