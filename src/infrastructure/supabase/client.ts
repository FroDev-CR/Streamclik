'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getClientEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase para el navegador.
 *
 * Sus responsabilidades son la suscripción a Realtime y la reconsulta del último
 * PIN al reconectar. Las lecturas de página ocurren en Server Components y las
 * escrituras en Server Actions, así que este cliente no toca nada más.
 *
 * Se cachea la instancia: cada `createClient` abre su propia conexión de
 * Realtime, y crear uno por render dejaría WebSockets huérfanos acumulándose en
 * cada re-render del componente.
 *
 * El obtenedor de token se guarda aparte y no se captura en el cliente cacheado.
 * Si se capturase el primero, el cliente seguiría firmando con la función de
 * aquel render para siempre; al cerrar sesión y entrar con otra cuenta, las
 * suscripciones seguirían autenticadas como el usuario anterior. RLS evaluaría
 * ese token y el nuevo usuario recibiría los PIN del anterior — el fallo exacto
 * que las políticas existen para impedir.
 */

let browserClient: SupabaseClient<Database> | null = null;
let currentGetToken: () => Promise<string | null> = async () => null;

export function createSupabaseBrowserClient(
  getToken?: () => Promise<string | null>,
): SupabaseClient<Database> {
  if (getToken) currentGetToken = getToken;

  if (browserClient) return browserClient;

  const env = getClientEnv();

  browserClient = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // La indirección es deliberada: se resuelve el obtenedor vigente en cada
      // llamada, no el que existía al construir el cliente.
      accessToken: () => currentGetToken(),
    },
  );

  return browserClient;
}
