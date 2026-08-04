'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin, requireUser } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

const claimSchema = z.object({
  rewardId: z.string().uuid(),
  serviceId: z.string().uuid('Selecciona una plataforma'),
});

/** Convierte una recompensa disponible en un perfil activo por sus días. */
export async function reclamarRecompensaAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser('/perfil#recompensas');

  const parsed = claimSchema.safeParse({
    rewardId: formData.get('rewardId'),
    serviceId: formData.get('serviceId'),
  });

  if (!parsed.success) {
    return { error: 'Selecciona una plataforma válida.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('reclamar_recompensa', {
    p_reward_id: parsed.data.rewardId,
    p_service_id: parsed.data.serviceId,
  });

  if (error) {
    logger.error('No se pudo reclamar la recompensa', { error: error.message });
    return { error: 'No pudimos reclamar el perfil. Inténtalo de nuevo.' };
  }

  const result = (data ?? {}) as {
    status?: string;
    service_name?: string;
    duration_days?: number;
  };

  revalidatePath('/perfil');
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  revalidatePath('/admin/clientes');

  switch (result.status) {
    case 'reclamada':
      return {
        success: `${result.service_name ?? 'Tu perfil'} ya está activo por ${result.duration_days ?? 30} días.`,
      };
    case 'sin_cupos':
      return {
        error: 'No hay perfiles libres de esa plataforma. Tu recompensa sigue disponible.',
      };
    case 'ya_reclamada':
      return { success: 'Esta recompensa ya había sido reclamada.' };
    case 'servicio_no_disponible':
      return { error: 'Esa plataforma ya no está disponible.' };
    default:
      return { error: 'La recompensa ya no está disponible.' };
  }
}

const adminRewardSchema = z.object({
  userId: z.string().uuid(),
  durationDays: z.coerce.number().int().min(1).max(365),
  note: z
    .string()
    .trim()
    .max(280)
    .optional()
    .transform((value) => value || null),
});

/** El operador puede regalar manualmente un perfil a cualquier cliente. */
export async function crearRecompensaAdminAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = adminRewardSchema.safeParse({
    userId: formData.get('userId'),
    durationDays: formData.get('durationDays'),
    note: formData.get('note'),
  });

  if (!parsed.success) {
    return { error: 'Revisa la duración y la nota de la recompensa.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('profile_rewards').insert({
    user_id: parsed.data.userId,
    source: 'admin',
    duration_days: parsed.data.durationDays,
    note: parsed.data.note,
    created_by: admin.id,
  });

  if (error) {
    logger.error('No se pudo crear la recompensa manual', {
      error: error.message,
    });
    return { error: 'No se pudo crear la recompensa.' };
  }

  revalidatePath('/admin/clientes');
  revalidatePath('/perfil');
  return { success: 'Recompensa creada.' };
}
