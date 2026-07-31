import type { Metadata } from 'next';

import { requireAdmin } from '@/features/auth/session';
import { AccountInventory } from '@/features/admin/components/account-inventory';
import { CreateAccountForm } from '@/features/admin/components/create-account-form';
import { getAdminAccounts, getClientOptions, getServiceOptions } from '@/features/admin/queries';

export const metadata: Metadata = { title: 'Administración' };

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
  const [services, clients, accounts] = await Promise.all([
    getServiceOptions(),
    getClientOptions(),
    getAdminAccounts(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Administración</h1>
        <p className="mt-1 text-sm text-[--color-content-muted]">
          Gestiona el inventario de cuentas y las asignaciones de perfiles
        </p>
      </div>

      <CreateAccountForm services={services} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[--color-content-muted]">
          Inventario ({accounts.length})
        </h2>
        <AccountInventory accounts={accounts} clients={clients} />
      </section>
    </div>
  );
}
