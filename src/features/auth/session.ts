import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import type { UserProfile } from '@/core/domain/entities';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

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

    // El correo primario puede no estar asignado todavía en el instante
    // siguiente al alta, así que se cae a la primera dirección de la lista antes
    // de rendirse. `sync_current_user` aborta con 22004 si no recibe ninguno, y
    // el usuario se quedaría sin perfil por una carrera de milisegundos.
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ??
      null;
    const fullName =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').trim() || null;

    const { error } = await supabase.rpc('sync_current_user', {
      p_email: email,
      p_full_name: fullName,
    });

    // Antes se devolvía `null` en silencio. El síntoma resultante no era un
    // error sino un bucle de redirección (ver `requireUser`), y sin esta traza
    // no había forma de saber si la causa fue el correo ausente, el claim
    // `role` que falta en el JWT o un fallo de red.
    if (error) {
      logger.error('No se pudo sincronizar el perfil del usuario de Clerk', {
        clerkUserId: userId,
        error: error.message,
        code: error.code,
      });
      return null;
    }

    const { data: creado } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    profile = creado;
  }

  if (!profile) {
    logger.error('Hay sesión de Clerk pero no se pudo resolver el perfil', {
      clerkUserId: userId,
    });
    return null;
  }

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

/**
 * Exige sesión; si no la hay, redirige al login conservando el destino.
 *
 * ⚠️ Hay **dos** motivos por los que `getCurrentUser()` devuelve `null` y no
 * pueden tratarse igual:
 *
 *  1. No hay sesión de Clerk. Redirigir al login es lo correcto.
 *  2. Sí hay sesión de Clerk, pero no se pudo resolver el perfil de
 *     `user_profiles`. Aquí redirigir al login es **el peor error posible**:
 *     `<SignIn>` ve una sesión activa, reenvía al destino privado, éste vuelve a
 *     no encontrar perfil y rebota otra vez al login. El resultado es un bucle
 *     infinito que en el navegador se ve como una página parpadeando sin avanzar
 *     y sin ningún mensaje. Costó una sesión de depuración: el síntoma («la
 *     página parpadea») no apunta en absoluto a su causa (el alta del perfil).
 *
 * Por eso el segundo caso lanza. Un error visible con su traza en el log es
 * infinitamente preferible a un parpadeo mudo, y `logger.error` en
 * `getCurrentUser()` deja escrito cuál de las causas fue.
 *
 * El parámetro se llama `redirect_url` porque es el que leen `/login` y
 * `/registro`. Antes se enviaba como `next`, que ninguna de las dos páginas mira:
 * el destino se perdía siempre y todo el mundo acababa en `/dashboard`.
 */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;

  const { userId } = await auth();

  if (!userId) {
    const target = nextPath ? `/login?redirect_url=${encodeURIComponent(nextPath)}` : '/login';
    redirect(target);
  }

  throw new Error(
    'Hay sesión de Clerk pero no se pudo crear o leer el perfil en Supabase. ' +
      'Revisa que la integración de Clerk con Supabase esté activa (el JWT debe ' +
      'llevar el claim role: "authenticated") y consulta el log del servidor.',
  );
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
