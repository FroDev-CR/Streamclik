import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase para Server Components y Server Actions.
 *
 * Usa la clave publicable con el JWT de Clerk adjunto, de modo que **RLS se
 * aplica**. Es el cliente por defecto: si una operación funciona con este, no
 * debe usarse el administrativo.
 *
 * Ya no hay cookies de Supabase de por medio. Con Clerk como proveedor externo,
 * la sesión la custodia Clerk y Supabase se limita a validar el token contra su
 * JWKS en cada petición. Eso elimina de un plumazo el refresco de token en el
 * middleware y la clase de error que producía: una sesión que se caía cada hora
 * y que en desarrollo no se notaba nunca.
 *
 * `getToken()` se invoca en cada consulta y no una sola vez al construir el
 * cliente: Clerk rota el token de sesión cada pocos minutos, y un cliente de
 * larga vida acabaría firmando con uno caducado. Clerk cachea internamente, así
 * que llamarlo a menudo no cuesta una petición de red.
 */
export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const { getToken } = await auth();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => (await getToken()) ?? null,
  });
}
