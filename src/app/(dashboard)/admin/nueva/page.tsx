import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/features/auth/session';
import { CreateAccountForm } from '@/features/admin/components/create-account-form';
import { getServiceOptions } from '@/features/admin/queries';

export const metadata: Metadata = { title: 'Añadir cuenta' };

/**
 * Alta de una cuenta en el banco.
 *
 * Página propia y no un panel dentro del banco: es una tarea ocasional —una vez
 * por cuenta comprada— y el formulario tiene ocho campos. Compartir pantalla con
 * el inventario obligaba a elegir entre un banco estrecho o un formulario
 * apretado, y ninguna de las dos ayudaba.
 */
export default async function NuevaCuentaPage() {
  await requireAdmin();

  const servicios = await getServiceOptions();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="sm" aria-label="Volver al banco de cuentas">
            <ArrowLeft aria-hidden className="size-4" strokeWidth={2.5} />
          </Button>
        </Link>

        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-none tracking-[-0.04em]">
            Añadir cuenta
          </h1>
          <p className="mt-1 text-sm text-[var(--color-content-muted)]">
            Sus perfiles se crean automáticamente
          </p>
        </div>
      </div>

      {servicios.error && (
        <p
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 font-mono text-xs"
        >
          {servicios.error}
        </p>
      )}

      <div className="max-w-xl">
        <CreateAccountForm services={servicios.data} />
      </div>
    </div>
  );
}
