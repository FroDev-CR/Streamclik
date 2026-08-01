import type { UserProfile } from '@/core/domain/entities';

/**
 * ¿Se le ha preguntado ya el WhatsApp a este cliente?
 *
 * La marca vive en `notification_preferences.onboarded` y no se deduce de que
 * `phone` tenga valor. La diferencia importa: si sólo se mirara el teléfono,
 * quien decidiera no darlo vería la misma pantalla en cada visita, y una
 * pregunta que no acepta un «no» deja de ser una pregunta.
 *
 * Se comprueban ambas cosas porque los clientes que ya existían antes de este
 * paso tienen teléfono pero no la marca, y no tiene sentido preguntarles algo
 * que ya nos dieron.
 */
export function yaCompletoOnboarding(profile: Pick<UserProfile, 'phone' | 'notificationPreferences'>): boolean {
  if (profile.phone) return true;

  const preferencias = profile.notificationPreferences as unknown;

  return (
    typeof preferencias === 'object' &&
    preferencias !== null &&
    (preferencias as Record<string, unknown>).onboarded === true
  );
}
