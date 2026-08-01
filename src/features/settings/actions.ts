'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { requireUser } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { logger } from '@/lib/logger';

/**
 * Ajustes del propio usuario.
 *
 * La política RLS «usuarios actualizan su propio perfil» sólo deja tocar la
 * fila cuyo `id` coincide con la identidad del JWT, así que un `user_id`
 * manipulado no llega a ninguna parte. Y aunque alguien colara `role` en el
 * formulario, el trigger `guard_user_role_change` rechaza el cambio: escalar a
 * administrador editando tu propio perfil no es posible ni saltándose la
 * interfaz.
 */

const perfilSchema = z.object({
  fullName: z
    .string()
    .trim()
    .max(120, 'El nombre no puede superar los 120 caracteres')
    .optional()
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .max(30, 'El teléfono no puede superar los 30 caracteres')
    // Permisivo a propósito: los formatos varían por país y rechazar un número
    // válido por no encajar en una expresión regular es peor que aceptarlo.
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser('/configuracion');

  const parsed = perfilSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('user_profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
    })
    .eq('id', user.id);

  if (error) {
    logger.error('No se pudieron guardar los ajustes', { error: error.message });
    return { error: 'No se pudieron guardar los cambios' };
  }

  revalidatePath('/configuracion');
  revalidatePath('/dashboard');

  return { success: 'Cambios guardados' };
}
