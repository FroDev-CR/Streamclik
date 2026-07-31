import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
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
 *
 * Con Clerk hay dos identidades en juego y conviene no confundirlas:
 * el `sub` del JWT (`user_2abc…`), que es la identidad externa, y el uuid de
 * `user_profiles`, que es la interna a la que apuntan todas las claves foráneas.
 * `SessionUser.id` es siempre **la interna**, igual que antes de la migración,
 * para que el resto de la aplicación no tenga que enterarse del cambio.
 */

export interface SessionUser {
  id: string;
  email: string;
  profile: UserProfile;
}

/**
 * Devuelve la sesión actual o `null`.
 *
 * El perfil se crea en el primer inicio de sesión mediante `sync_current_user`,
 * que toma la identidad del JWT y no de sus parámetros. Se llama aquí y no en un
 * webhook de Clerk porque un webhook puede llegar tarde: el usuario que acaba de
 * registrarse aterrizaría en un dashboard sin perfil y vería un error en su
 * primera pantalla de la aplicación.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = await createSupabaseServerClient();

  const { data: existente } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  let profile = existente;

  if (!profile) {
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
    const fullName =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').trim() || null;

    const { error } = await supabase.rpc('sync_current_user', {
      p_email: email,
      p_full_name: fullName,
    });

    if (error) return null;

    const { data: creado } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    profile = creado;
  }

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
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
 *
 * El rol se lee de `user_profiles` y no de los metadatos de Clerk a propósito:
 * revocar admin surte efecto en la siguiente consulta, sin esperar a que caduque
 * el token de sesión.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser('/admin');

  if (user.profile.role !== 'admin') {
    redirect('/dashboard');
  }

  return user;
}
