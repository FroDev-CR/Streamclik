import type { Metadata } from 'next';
import { Images } from 'lucide-react';

import { requireAdmin } from '@/features/auth/session';
import { MediaLibraryPanel } from '@/features/media/components/media-library';
import { getMediaLibrary } from '@/features/media/queries';

export const metadata: Metadata = { title: 'Multimedia' };

/**
 * Biblioteca multimedia — respaldo propio de las piezas de publicidad.
 *
 * Existe para no repartir los artes entre Drive, el carrete del teléfono y los
 * chats donde se enviaron. Es sólo del operador: las políticas del bucket
 * `multimedia` exigen `is_admin()` en las cuatro operaciones, así que un cliente
 * que escriba la URL a mano no ve nada aunque `requireAdmin()` fallara.
 */
export default async function MultimediaPage() {
  await requireAdmin();

  const biblioteca = await getMediaLibrary();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Images aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Multimedia
        </h1>
      </header>

      <MediaLibraryPanel
        imagenes={biblioteca.imagenes}
        videos={biblioteca.videos}
        error={biblioteca.error}
      />
    </div>
  );
}
