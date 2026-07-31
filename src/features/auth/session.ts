import 'server-only';

import { redirect } from 'next/navigation';

import type { UserProfile } from '@/core/domain/entities';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Guardias de sesión para Server Components y Server Actions.
 *
 * Son **defensa en profundidad**, no la frontera de seguridad. Esa la ponen las
 * políticas RLS (docs/adr/0003): aunque estas funciones se olvidaran en una ruta
 * nueva, Postgres seguiría sin devolver filas ajenas. Lo que aportan aquí es una
 * redirección limpia en vez de una pantalla vacía sin explicación.
 */

export interface SessionUser {
  id: string;
  email: string;
  profile: UserProfile;
}

/**
 * Devuelve la sesión actual o `null`.
 *
 * Usa `getUser()` y no `getSession()`: el segundo decodifica la cookie sin
 * verificar su firma contra el servidor de Auth.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      role: profile.role,
      telegramChatId: profile.telegram_chat_id,
      notificationPreferences: (profile.notification_preferences ??
        {}) as UserProfile['notificationPreferences'],
      createdAt: profile.created_at,
    },
  };
}

/** Exige sesión; si no la hay, redirige al login conservando el destino. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';
    redirect(target);
  }

  return user;
}

/**
 * Exige rol de administrador.
 *
 * Se redirige al dashboard en vez de mostrar un 403: un cliente que llega a
 * `/admin` casi siempre lo hace por un enlace equivocado, no intentando escalar
 * privilegios. Y si lo intentara, RLS ya le devolvería cero filas.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser('/admin');

  if (user.profile.role !== 'admin') {
    redirect('/dashboard');
  }

  return user;
}
