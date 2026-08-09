'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

import { MEDIA_FOLDERS } from './tipos';

/**
 * Acciones de la biblioteca multimedia.
 *
 * La **subida no está aquí**: va del navegador directo a Storage. Una Server
 * Action de Next admite 1 MB de cuerpo por defecto, así que cualquier vídeo
 * fallaría; y subir el archivo primero al servidor para reenviarlo a Supabase
 * duplicaría el tráfico y lo cargaría entero en memoria. El navegador tiene el
 * token de Clerk y las políticas del bucket exigen `is_admin()`, así que la
 * autorización se aplica igual.
 *
 * Lo que sí vive aquí es el borrado —una operación pequeña que conviene tener
 * comprobada en el servidor— y la revalidación de la página tras subir.
 */

// La ruta debe empezar por una de las dos carpetas conocidas. Sin esta
// comprobación, un `path` manipulado permitiría borrar objetos de otro prefijo
// del mismo bucket.
const CARPETAS = Object.values(MEDIA_FOLDERS);

const rutaSchema = z
  .string()
  .min(3)
  .max(300)
  .refine((valor) => CARPETAS.some((carpeta) => valor.startsWith(`${carpeta}/`)), {
    message: 'Ruta fuera de la biblioteca',
  })
  // `..` en una clave de Storage no escala directorios, pero rechazarlo evita
  // tener que razonar sobre ello cada vez que se lea este código.
  .refine((valor) => !valor.includes('..'), { message: 'Ruta no válida' });

export async function eliminarMedioAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = rutaSchema.safeParse(formData.get('path'));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Archivo no válido' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.storage.from('multimedia').remove([parsed.data]);

  if (error) {
    logger.error('No se pudo borrar el archivo multimedia', {
      error: error.message,
      path: parsed.data,
    });
    return { error: 'No se pudo borrar el archivo.' };
  }

  revalidatePath('/admin/multimedia');

  return { success: 'Archivo borrado' };
}

/**
 * Refrescar la galería tras una subida hecha desde el navegador.
 *
 * El archivo ya está en Storage cuando esto se llama; lo único que falta es que
 * el Server Component vuelva a listar el bucket. Sin esta llamada, el operador
 * sube algo y no lo ve hasta recargar a mano.
 */
export async function refrescarMultimediaAction(): Promise<void> {
  await requireAdmin();
  revalidatePath('/admin/multimedia');
}
