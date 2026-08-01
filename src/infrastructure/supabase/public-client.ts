import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase sin identidad, para las páginas públicas.
 *
 * Usa la clave publicable **sin adjuntar ningún token**, así que Postgres atiende
 * la petición como `anon`. Con RLS activo en todas las tablas eso significa que
 * no puede leer absolutamente nada: sólo sirve para invocar funciones concedidas
 * explícitamente a `anon`, como `catalogo_publico()`.
 *
 * Existe separado de `server.ts` por dos motivos:
 *
 * 1. `server.ts` llama a `auth()` de Clerk, lo que obliga a la página a
 *    renderizarse dinámicamente en cada petición. La portada no necesita saber
 *    quién la visita, y pagar ese coste en la página más visitada no tiene
 *    sentido.
 * 2. Deja explícito en el propio import que ese código corre sin sesión. Al leer
 *    una consulta importa mucho saber con qué permisos se ejecuta.
 */
export function createSupabasePublicClient() {
  const env = getServerEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
