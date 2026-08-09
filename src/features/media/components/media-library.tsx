'use client';

import { useAuth } from '@clerk/nextjs';
import { useActionState, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Download, Film, ImageIcon, Trash2, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ActionState } from '@/features/shared/action-state';
import { createSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { cn, formatDateTime } from '@/lib/utils';

import { eliminarMedioAction, refrescarMultimediaAction } from '../actions';
import {
  MEDIA_FOLDERS,
  MEDIA_MAX_BYTES,
  MEDIA_MIMES,
  formatBytes,
  kindFromMime,
  safeStorageName,
  type MediaAsset,
  type MediaKind,
} from '../tipos';

/**
 * Biblioteca multimedia del operador.
 *
 * Es un respaldo, no un gestor de contenidos: subir, ver, descargar y borrar.
 * Nada de carpetas anidadas, etiquetas ni búsqueda, porque el volumen real son
 * unas decenas de piezas de publicidad y cada función de más es una pantalla más
 * que mantener.
 *
 * La subida va del navegador **directa a Storage**, sin pasar por el servidor de
 * Next. Es la única forma de subir un vídeo: una Server Action admite 1 MB de
 * cuerpo por defecto. Y no debilita nada — el token de Clerk viaja igual y las
 * políticas del bucket exigen `is_admin()`.
 */

const ACEPTA: Record<MediaKind, string> = {
  imagen: MEDIA_MIMES.imagen.join(','),
  video: MEDIA_MIMES.video.join(','),
};

const PESTANAS: ReadonlyArray<{
  kind: MediaKind;
  etiqueta: string;
  icono: typeof ImageIcon;
}> = [
  { kind: 'imagen', etiqueta: 'Imágenes', icono: ImageIcon },
  { kind: 'video', etiqueta: 'Vídeos', icono: Film },
];

/* -------------------------------------------------------------------------- */

function BotonBorrar({ path }: { path: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(eliminarMedioAction, {});
  const [confirmando, setConfirmando] = useState(false);

  if (state.success) return null;

  if (!confirmando) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirmando(true)}
        aria-label="Borrar archivo"
      >
        <Trash2 aria-hidden className="size-4" strokeWidth={2.5} />
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="path" value={path} />
      <Button type="submit" variant="danger" size="sm">
        Borrar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
        No
      </Button>
      {state.error && <span className="sr-only">{state.error}</span>}
    </form>
  );
}

function Tarjeta({ asset }: { asset: MediaAsset }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border-[3px] border-[var(--color-border)] bg-[var(--color-surface)] shadow-[5px_5px_0_var(--color-border)]">
      <div className="relative aspect-video overflow-hidden border-b-2 border-[var(--color-border)] bg-[var(--color-canvas)]">
        {asset.url ? (
          asset.kind === 'imagen' ? (
            // `img` y no `next/image`: la URL está firmada y caduca, así que el
            // optimizador no puede cachearla y sólo añadiría una petición más.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt={asset.nombre}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            // `preload="metadata"` carga sólo la cabecera: con `auto`, abrir la
            // pestaña de vídeos empezaría a descargar todos a la vez.
            <video
              src={asset.url}
              controls
              preload="metadata"
              className="size-full bg-black object-contain"
            />
          )
        ) : (
          <div className="grid size-full place-items-center px-4 text-center">
            <p className="text-xs font-semibold text-[var(--color-content-muted)]">
              No se pudo generar la vista previa
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="truncate text-sm font-semibold" title={asset.nombre}>
          {asset.nombre}
        </p>

        <p className="text-xs text-[var(--color-content-muted)]">
          {formatBytes(asset.bytes)} · {formatDateTime(asset.createdAt)}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {asset.url ? (
            // El parámetro `download` de Supabase fuerza el `Content-Disposition`
            // de descarga. Sin él, el navegador abre la imagen en una pestaña y
            // el operador tiene que hacer «guardar como» a mano.
            <a
              href={`${asset.url}&download=${encodeURIComponent(asset.nombre)}`}
              download={asset.nombre}
            >
              <Button type="button" variant="secondary" size="sm">
                <Download aria-hidden className="size-4" strokeWidth={2.5} />
                Descargar
              </Button>
            </a>
          ) : (
            <span />
          )}

          <BotonBorrar path={asset.path} />
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

export function MediaLibraryPanel({
  imagenes,
  videos,
  error,
}: {
  imagenes: MediaAsset[];
  videos: MediaAsset[];
  error: string | null;
}) {
  const [pestana, setPestana] = useState<MediaKind>('imagen');
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const entradaRef = useRef<HTMLInputElement>(null);
  const { getToken } = useAuth();

  const assets = pestana === 'imagen' ? imagenes : videos;

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;

    setFallo(null);
    const supabase = createSupabaseBrowserClient(getToken);
    const problemas: string[] = [];

    // En serie y no en paralelo: subir cuatro vídeos a la vez desde datos
    // móviles satura la conexión y los hace fallar todos. Uno detrás de otro
    // tarda lo mismo y avisa de cuál va.
    for (let i = 0; i < archivos.length; i += 1) {
      const archivo = archivos[i]!;
      const kind = kindFromMime(archivo.type);

      if (!kind) {
        problemas.push(`«${archivo.name}»: formato no admitido`);
        continue;
      }

      if (archivo.size > MEDIA_MAX_BYTES) {
        problemas.push(`«${archivo.name}»: pesa ${formatBytes(archivo.size)}, el tope son 50 MB`);
        continue;
      }

      setSubiendo(`${archivo.name} (${i + 1}/${archivos.length})`);

      // El tipo decide la carpeta, no la pestaña abierta: soltar un vídeo
      // estando en «Imágenes» debe archivarlo donde corresponde.
      const ruta = `${MEDIA_FOLDERS[kind]}/${safeStorageName(archivo.name)}`;

      const { error: errorSubida } = await supabase.storage
        .from('multimedia')
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

      if (errorSubida) {
        problemas.push(`«${archivo.name}»: ${errorSubida.message}`);
      }
    }

    setSubiendo(null);
    if (entradaRef.current) entradaRef.current.value = '';

    if (problemas.length > 0) setFallo(problemas.join(' · '));

    // Aunque algo falle, lo que sí subió tiene que aparecer.
    startTransition(() => {
      void refrescarMultimediaAction();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudo cargar la biblioteca
          </p>
          <p className="mt-2 font-mono text-xs">{error}</p>
        </div>
      )}

      {/* Pestañas */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de archivo">
        {PESTANAS.map(({ kind, etiqueta, icono: Icono }) => {
          const activa = pestana === kind;
          const total = kind === 'imagen' ? imagenes.length : videos.length;

          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(kind)}
              className={cn(
                'flex items-center gap-2 rounded-xl border-2 border-[var(--color-border)] px-4 py-2',
                'font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-wide',
                'transition-[transform,box-shadow,background-color] duration-100',
                activa
                  ? 'bg-[var(--color-content)] text-[var(--color-surface)] shadow-[4px_4px_0_var(--color-brand-yellow)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-content)] shadow-[4px_4px_0_var(--color-border)] hover:bg-[var(--color-canvas)]',
              )}
            >
              <Icono aria-hidden className="size-4" strokeWidth={2.5} />
              {etiqueta}
              <Badge tone={activa ? 'success' : 'neutral'}>{total}</Badge>
            </button>
          );
        })}
      </div>

      {/* Subida */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <label
            htmlFor="multimedia-archivo"
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] px-4 py-8 text-center transition-colors',
              subiendo ? 'opacity-60' : 'hover:bg-[var(--color-canvas)]',
            )}
          >
            <Upload aria-hidden className="size-6" strokeWidth={2.5} />
            <span className="font-[family-name:var(--font-display)] text-sm font-black uppercase">
              {subiendo ? `Subiendo ${subiendo}…` : 'Tocar para subir'}
            </span>
            <span className="text-xs text-[var(--color-content-muted)]">
              Imágenes y vídeos, hasta 50 MB por archivo. Podés elegir varios a la vez.
            </span>
          </label>

          <input
            id="multimedia-archivo"
            ref={entradaRef}
            type="file"
            multiple
            disabled={Boolean(subiendo)}
            // Se aceptan los dos tipos con independencia de la pestaña: el
            // archivo se clasifica solo por su MIME.
            accept={`${ACEPTA.imagen},${ACEPTA.video}`}
            className="sr-only"
            onChange={(evento) => void subir(evento.target.files)}
          />

          {fallo && (
            <p
              role="alert"
              className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--color-danger)]"
            >
              {fallo}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Galería */}
      {assets.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          {pestana === 'imagen' ? (
            <ImageIcon aria-hidden className="size-8" strokeWidth={2} />
          ) : (
            <Film aria-hidden className="size-8" strokeWidth={2} />
          )}
          <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase">
            {pestana === 'imagen' ? 'Sin imágenes todavía' : 'Sin vídeos todavía'}
          </p>
          <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
            Subí acá tus artes de publicidad y quedan guardados, listos para descargar cuando los
            necesités.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <Tarjeta key={asset.path} asset={asset} />
          ))}
        </ul>
      )}
    </div>
  );
}
