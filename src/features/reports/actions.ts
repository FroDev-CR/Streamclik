'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { notificarAdminsDePago } from '@/infrastructure/notifications/admin-push';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { requireAdmin, requireUser } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { toFieldErrors } from '@/features/shared/action-state';
import { logger } from '@/lib/logger';

/**
 * Reportar un problema con una cuenta.
 *
 * La comprobación de que la cuenta es del cliente vive en la política de
 * inserción de `account_reports`, no aquí: un `assignment_id` ajeno lo rechaza
 * Postgres. `requireUser()` es la segunda barrera, no la única.
 */

const TIPOS_ACEPTADOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

const TAMANO_MAXIMO = 5 * 1024 * 1024;
const MAX_CAPTURAS = 3;

const EXTENSIONES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const reporteSchema = z.object({
  assignmentId: z.string().uuid('Elige cuál de tus cuentas'),
  reason: z
    .string()
    .trim()
    .min(5, 'Cuéntanos un poco más de lo que pasa')
    .max(1000, 'El texto es demasiado largo'),
});

/**
 * Crea el reporte y sube las capturas.
 *
 * Las capturas son opcionales: exigirlas dejaría fuera a quien reporta desde el
 * televisor, que es donde más se rompe. Se suben después de insertar la fila
 * porque la ruta lleva el identificador del reporte.
 */
export async function crearReporteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser('/soporte');

  const parsed = reporteSchema.safeParse({
    assignmentId: formData.get('assignmentId'),
    reason: formData.get('reason'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const archivos = formData
    .getAll('screenshots')
    .filter((item): item is File => item instanceof File && item.size > 0)
    .slice(0, MAX_CAPTURAS);

  for (const archivo of archivos) {
    if (archivo.size > TAMANO_MAXIMO) {
      return { fieldErrors: { screenshots: 'Cada captura debe pesar menos de 5 MB' } };
    }
    if (!TIPOS_ACEPTADOS.includes(archivo.type as (typeof TIPOS_ACEPTADOS)[number])) {
      return { fieldErrors: { screenshots: 'Sube imágenes (JPG, PNG, WEBP o HEIC) o un PDF' } };
    }
  }

  const supabase = await createSupabaseServerClient();

  const { data: reporte, error } = await supabase
    .from('account_reports')
    .insert({
      assignment_id: parsed.data.assignmentId,
      reported_by: user.id,
      reason: parsed.data.reason,
    })
    .select('id')
    .single();

  if (error || !reporte) {
    if (error?.code === '42501') {
      return { error: 'Esa cuenta no está a tu nombre.' };
    }
    logger.error('No se pudo crear el reporte', { error: error?.message, code: error?.code });
    return { error: 'No se pudo enviar el reporte. Inténtalo de nuevo.' };
  }

  const rutas: string[] = [];

  for (const [indice, archivo] of archivos.entries()) {
    const extension = EXTENSIONES[archivo.type] ?? 'bin';
    // La primera carpeta es el uuid del cliente: es lo que comprueba la política
    // de storage, así que la ruta forma parte de la autorización.
    const ruta = `${user.id}/${reporte.id}-${indice}.${extension}`;

    const { error: errorSubida } = await supabase.storage
      .from('reportes')
      .upload(ruta, archivo, { contentType: archivo.type, upsert: true });

    if (errorSubida) {
      // Una captura que falla no debe tirar el reporte: el texto es lo que
      // permite empezar a atenderlo.
      logger.warn('No se pudo subir una captura del reporte', {
        reporteId: reporte.id,
        error: errorSubida.message,
      });
      continue;
    }

    rutas.push(ruta);
  }

  if (rutas.length > 0) {
    await supabase.from('account_reports').update({ screenshots: rutas }).eq('id', reporte.id);
  }

  // Mismo canal que los pagos: el operador ya tiene los avisos activados ahí y
  // un problema de cuenta es igual de urgente que un cobro.
  await notificarAdminsDePago({
    titulo: 'Nuevo reporte de cuenta',
    cuerpo: `${user.profile.fullName ?? user.email} reportó un problema. Míralo en Solicitudes.`,
    url: '/admin/solicitudes',
  });

  revalidatePath('/soporte');
  revalidatePath('/admin/solicitudes');

  return { success: 'Reporte enviado. Lo revisamos y te escribimos.' };
}

// -----------------------------------------------------------------------------
// Operador
// -----------------------------------------------------------------------------

const resolverSchema = z.object({
  reportId: z.string().uuid('Reporte no válido'),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : null)),
  status: z.enum(['resolved', 'rejected']),
});

/** Marca el reporte como resuelto o descartado, con una nota para el cliente. */
export async function resolverReporteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = resolverSchema.safeParse({
    reportId: formData.get('reportId'),
    note: formData.get('note'),
    status: formData.get('status'),
  });

  if (!parsed.success) {
    return { error: 'Reporte no válido' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('account_reports')
    .update({
      status: parsed.data.status,
      resolution_note: parsed.data.note,
      resolved_at: new Date().toISOString(),
      resolved_by: admin.id,
    })
    .eq('id', parsed.data.reportId);

  if (error) {
    logger.error('No se pudo resolver el reporte', { error: error.message });
    return { error: 'No se pudo actualizar el reporte.' };
  }

  revalidatePath('/admin/solicitudes');
  revalidatePath('/soporte');

  return {
    success: parsed.data.status === 'resolved' ? 'Reporte resuelto' : 'Reporte descartado',
  };
}
