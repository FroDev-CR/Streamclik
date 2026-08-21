import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GoPlayImport } from '@/features/admin/components/goplay-import';
import { getInventarioDeGoPlay } from '@/features/admin/goplay-queries';
import { getServiceOptions } from '@/features/admin/queries';
import { requireAdmin } from '@/features/auth/session';

export const metadata: Metadata = { title: 'Importar de GoPlay' };

/**
 * Alta de cuentas compradas en GoPlay.
 *
 * Existe para que dar de alta una cuenta deje de ser copiar un identificador a
 * mano: su listado ya trae el correo, la contraseña, el producto y la fecha de
 * renovación, así que la cuenta se crea entera con un botón.
 */
export default async function GoPlayPage() {
  await requireAdmin();

  const [inventario, servicios] = await Promise.all([getInventarioDeGoPlay(), getServiceOptions()]);

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
            Importar de GoPlay
          </h1>
          <p className="mt-1 text-sm text-[var(--color-content-muted)]">
            Lo que ya compraste allá, dado de alta con un botón
          </p>
        </div>
      </div>

      <GoPlayImport
        cuentas={[...inventario.cuentas]}
        servicios={servicios.data ?? []}
        error={inventario.error}
      />
    </div>
  );
}
