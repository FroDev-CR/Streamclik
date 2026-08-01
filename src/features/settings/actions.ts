'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

// -----------------------------------------------------------------------------

const whatsappSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, 'El número parece demasiado corto')
    .max(30, 'El número parece demasiado largo'),
});

/**
 * Guarda el WhatsApp del cliente tras registrarse.
 *
 * Se marca el paso como visto aunque el usuario lo omita, usando
 * `notification_preferences.onboarded`. Sin esa marca no habría forma de
 * distinguir «todavía no se lo hemos preguntado» de «se lo preguntamos y no
 * quiso darlo», y le enseñaríamos la misma pantalla en cada visita.
 */
export async function saveWhatsappAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser('/bienvenida');
  const supabase = await createSupabaseServerClient();

  const preferencias = {
    ...(typeof user.profile.notificationPreferences === 'object'
      ? user.profile.notificationPreferences
      : {}),
    onboarded: true,
  };

  const parsed = whatsappSchema.safeParse({ phone: formData.get('phone') });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
    }
    return { fieldErrors };
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({ phone: parsed.data.phone, notification_preferences: preferencias })
    .eq('id', user.id);

  if (error) {
    logger.error('No se pudo guardar el WhatsApp', { error: error.message });
    return { error: 'No se pudo guardar el número. Inténtalo de nuevo.' };
  }

  revalidatePath('/', 'layout');
  // `redirect()` fuera de cualquier try: lanza NEXT_REDIRECT por diseño y un
  // catch lo tragaría, dejando el formulario sin navegar y sin error visible.
  redirect('/dashboard');
}

/**
 * Omitir el paso del WhatsApp.
 *
 * Acción aparte y no una rama dentro de `saveWhatsappAction`: las acciones de
 * `useActionState` reciben `(estadoPrevio, formData)` y no encajan como `action`
 * de un `<form>` suelto, que sólo pasa `formData`.
 *
 * Se marca igualmente como visto para no repetir la pregunta en cada visita.
 */
export async function skipWhatsappAction(): Promise<void> {
  const user = await requireUser('/bienvenida');
  const supabase = await createSupabaseServerClient();

  const preferencias = {
    ...(typeof user.profile.notificationPreferences === 'object'
      ? user.profile.notificationPreferences
      : {}),
    onboarded: true,
  };

  await supabase
    .from('user_profiles')
    .update({ notification_preferences: preferencias })
    .eq('id', user.id);

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
