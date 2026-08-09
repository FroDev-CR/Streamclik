import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

import { MEDIA_FOLDERS, displayName, type MediaAsset, type MediaKind } from './tipos';

/**
 * Listado de la biblioteca multimedia.
 *
 * Se lee el bucket directamente en vez de una tabla espejo. Con tabla habría que
 * mantener sincronizadas dos cosas que se pueden desincronizar de mil maneras
 * —un borrado a medias, una subida que falló tras insertar la fila—, y el
 * síntoma sería una miniatura rota o un archivo invisible. Aquí lo que se lista
 * es lo que existe.
 */

interface QueryResult<T> {
  data: T;
  error: string | null;
}

/** Una hora: suficiente para ver la galería y descargar sin recargar la página. */
const SEGUNDOS_FIRMA = 3600;

async function listarCarpeta(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  kind: MediaKind,
): Promise<QueryResult<MediaAsset[]>> {
  const carpeta = MEDIA_FOLDERS[kind];

  const { data, error } = await supabase.storage.from('multimedia').list(carpeta, {
    limit: 500,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    logger.error('No se pudo listar la biblioteca multimedia', {
      error: error.message,
      carpeta,
    });
    return { data: [], error: error.message };
  }

  // `list()` devuelve también un marcador de carpeta vacía sin identificador.
  // Sin este filtro aparecería una tarjeta fantasma de 0 bytes.
  const archivos = (data ?? []).filter((archivo) => archivo.id !== null);

  if (archivos.length === 0) return { data: [], error: null };

  const rutas = archivos.map((archivo) => `${carpeta}/${archivo.name}`);

  // Una sola llamada para todas las firmas en vez de una por archivo: con
  // cincuenta piezas, la versión encadenada sumaba segundos al primer byte.
  const { data: firmadas, error: errorFirma } = await supabase.storage
    .from('multimedia')
    .createSignedUrls(rutas, SEGUNDOS_FIRMA);

  if (errorFirma) {
    logger.error('No se pudieron firmar las URL de la biblioteca', {
      error: errorFirma.message,
    });
  }

  const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  return {
    data: archivos.map((archivo) => {
      const path = `${carpeta}/${archivo.name}`;

      return {
        path,
        nombre: displayName(archivo.name),
        kind,
        bytes: archivo.metadata?.size ?? 0,
        // `created_at` puede faltar en objetos antiguos migrados a mano.
        createdAt: archivo.created_at ?? new Date().toISOString(),
        mimeType: archivo.metadata?.mimetype ?? null,
        url: porRuta.get(path) ?? null,
      };
    }),
    error: null,
  };
}

export interface MediaLibrary {
  imagenes: MediaAsset[];
  videos: MediaAsset[];
  error: string | null;
}

/**
 * Toda la biblioteca, separada por tipo.
 *
 * Las dos carpetas se piden en paralelo: encadenarlas sumaría dos idas y vueltas
 * a Storage más las firmas antes de poder pintar nada.
 */
export async function getMediaLibrary(): Promise<MediaLibrary> {
  const supabase = await createSupabaseServerClient();

  const [imagenes, videos] = await Promise.all([
    listarCarpeta(supabase, 'imagen'),
    listarCarpeta(supabase, 'video'),
  ]);

  return {
    imagenes: imagenes.data,
    videos: videos.data,
    // Un fallo se muestra en pantalla en lugar de degradar a galería vacía: una
    // biblioteca vacía por error es indistinguible de una vacía de verdad, y esa
    // ambigüedad ya costó un ciclo de depuración en el banco de cuentas.
    error: imagenes.error ?? videos.error,
  };
}
