import type { Metadata } from 'next';
import { AlertTriangle, LayoutGrid } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { ComboManager } from '@/features/admin/components/combo-manager';
import { PlatformManager } from '@/features/admin/components/platform-manager';
import { getAdminCombos, getAdminPlatforms } from '@/features/admin/queries';

export const metadata: Metadata = { title: 'Configuración del catálogo' };

/**
 * Catálogo de plataformas.
 *
 * Lo que se cree aquí sale en la portada. Es la pantalla que evita tener que
 * tocar SQL para añadir un servicio nuevo, que era el único camino hasta ahora.
 */
export default async function PlataformasPage() {
  await requireAdmin();

  const [plataformas, combos] = await Promise.all([getAdminPlatforms(), getAdminCombos()]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <LayoutGrid aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Configuración
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Administra las plataformas, sus precios y los combos que aparecen en el catálogo.
        </p>
      </header>

      {plataformas.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar las plataformas
          </p>
          <p className="mt-2 font-mono text-xs">{plataformas.error}</p>
        </div>
      )}

      {combos.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar los combos
          </p>
          <p className="mt-2 font-mono text-xs">{combos.error}</p>
        </div>
      )}

      <PlatformManager platforms={plataformas.data} />
      <ComboManager combos={combos.data} platforms={plataformas.data} />
    </div>
  );
}
