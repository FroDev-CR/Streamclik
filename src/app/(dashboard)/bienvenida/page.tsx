import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireUser } from '@/features/auth/session';
import { WhatsappOnboarding } from '@/features/settings/components/whatsapp-onboarding';
import { yaCompletoOnboarding } from '@/features/settings/onboarding';

export const metadata: Metadata = { title: 'Bienvenido' };

/**
 * Paso de bienvenida tras el registro.
 *
 * Vive dentro del grupo `(dashboard)` para heredar su guardia de sesión, pero se
 * sale sola si ya no hace falta: sin esa comprobación, alguien que llegara por
 * un enlace antiguo vería otra vez la pantalla de alta.
 */
export default async function BienvenidaPage() {
  const user = await requireUser('/bienvenida');

  // El operador no pasa por aquí: el WhatsApp se pide para avisar y cobrar a los
  // clientes, y él no es cliente de sí mismo.
  if (user.profile.role === 'admin') redirect('/admin');

  if (yaCompletoOnboarding(user.profile)) redirect('/dashboard');

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <WhatsappOnboarding />
    </div>
  );
}
