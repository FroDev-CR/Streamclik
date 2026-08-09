/**
 * Tipos y reglas de la biblioteca multimedia.
 *
 * Módulo neutro —sin `server-only`— porque lo comparten la consulta del servidor
 * y el componente de cliente que sube los archivos. El navegador necesita las
 * mismas reglas para poder rechazar un archivo antes de gastar la subida.
 */

export type MediaKind = 'imagen' | 'video';

/** Carpeta del bucket para cada tipo. La carpeta ES la clasificación. */
export const MEDIA_FOLDERS: Record<MediaKind, string> = {
  imagen: 'imagenes',
  video: 'videos',
};

export const MEDIA_MIMES: Record<MediaKind, readonly string[]> = {
  imagen: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
};

/**
 * Techo por archivo.
 *
 * Debe coincidir con `file_size_limit` del bucket. Aquí sirve para dar un
 * mensaje decente antes de subir; el límite que de verdad manda es el de
 * Storage, porque este se puede saltar llamando a la API directamente.
 */
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export interface MediaAsset {
  /** Ruta completa dentro del bucket, p. ej. `imagenes/1712-portada.png`. */
  path: string;
  /** Lo que se muestra: el nombre original, sin el prefijo antifusión. */
  nombre: string;
  kind: MediaKind;
  bytes: number;
  createdAt: string;
  mimeType: string | null;
  /** URL firmada y temporal para ver o descargar. */
  url: string | null;
}

/** ¿A qué pestaña pertenece este tipo MIME? */
export function kindFromMime(mime: string): MediaKind | null {
  if (MEDIA_MIMES.imagen.includes(mime)) return 'imagen';
  if (MEDIA_MIMES.video.includes(mime)) return 'video';
  return null;
}

/**
 * Nombre seguro para Storage, conservando el original a la vista.
 *
 * Se antepone la marca de tiempo porque subir dos veces `portada.png` en meses
 * distintos machacaría la primera sin avisar. Y se limpian acentos y espacios:
 * las claves de S3 los aceptan, pero luego rompen al copiar la URL a un chat o
 * al descargar desde ciertos navegadores.
 */
export function safeStorageName(originalName: string): string {
  const limpio = originalName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${Date.now()}-${limpio || 'archivo'}`;
}

/** Deshace `safeStorageName` para mostrar algo legible. */
export function displayName(storageName: string): string {
  return storageName.replace(/^\d{10,}-/, '');
}

/** Tamaño en unidades humanas. Un «14680064» no le dice nada a nadie. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
