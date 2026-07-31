import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { getServerEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase para Server Components y Server Actions.
 *
 * Usa la clave `anon` con la sesión del usuario tomada de las cookies, de modo
 * que **RLS se aplica**. Es el cliente por defecto: si una operación funciona con
 * este, no debe usarse el administrativo.
 *
 * Es `async` porque en Next.js 15 `cookies()` devuelve una promesa.
 */
export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies: sólo pueden
            // hacerlo las Server Actions y los Route Handlers. Se ignora aquí
            // porque el middleware ya refresca la sesión en cada petición, que es
            // el lugar correcto para ello. Sin este catch, cualquier lectura
            // desde un Server Component lanzaría al intentar refrescar el token.
          }
        },
      },
    },
  );
}
