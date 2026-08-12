'use server';

import { z } from 'zod';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { requireUser } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { logger } from '@/lib/logger';

/**
 * Alta y baja de las suscripciones de aviso.
 *
 * La suscripción la crea el navegador y aquí sólo se guarda: el endpoint y las
 * dos claves con las que se cifra el contenido. Nada de esto es secreto para el
 * usuario —es su propio dispositivo—, pero sí lo es frente a terceros, y por eso
 * la política de `push_subscriptions` ata cada fila a su dueño.
 */

const suscripcionSchema = z.object({
  endpoint: z.string().url('Endpoint no válido'),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z
    .string()
    .max(300)
    .optional()
    .transform((value) => value || null),
});

export async function guardarSuscripcionPushAction(
  entrada: z.input<typeof suscripcionSchema>,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = suscripcionSchema.safeParse(entrada);
  if (!parsed.success) {
    return { error: 'La suscripción del navegador no es válida.' };
  }

  const supabase = await createSupabaseServerClient();

  // `upsert` por endpoint: el navegador devuelve la misma URL cada vez que se
  // vuelve a suscribir, así que sin esto se acumularía una fila por visita y el
  // operador recibiría el mismo aviso repetido tantas veces como filas hubiera.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: parsed.data.userAgent,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    logger.error('No se pudo guardar la suscripción push', { error: error.message });
    return { error: 'No se pudieron activar los avisos. Inténtalo de nuevo.' };
  }

  return { success: 'Avisos activados en este dispositivo' };
}

export async function borrarSuscripcionPushAction(endpoint: string): Promise<ActionState> {
  await requireUser();

  if (!z.string().url().safeParse(endpoint).success) {
    return { error: 'Endpoint no válido' };
  }

  const supabase = await createSupabaseServerClient();

  // Sin `.eq('user_id')`: RLS ya restringe la fila a su dueño y repetir la
  // condición aquí la duplicaría en dos sitios que pueden divergir.
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);

  if (error) {
    logger.error('No se pudo borrar la suscripción push', { error: error.message });
    return { error: 'No se pudieron desactivar los avisos.' };
  }

  return { success: 'Avisos desactivados en este dispositivo' };
}
