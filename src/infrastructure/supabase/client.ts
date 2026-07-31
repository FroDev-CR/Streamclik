'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getClientEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase para el navegador.
 *
 * Su única responsabilidad en esta aplicación es la suscripción a Realtime. Las
 * lecturas de datos ocurren en Server Components y las escrituras en Server
 * Actions, así que este cliente no consulta tablas.
 *
 * Se cachea la instancia: cada `createBrowserClient` abre su propia conexión de
 * Realtime, y crear uno por render dejaría WebSockets huérfanos acumulándose en
 * cada re-render del componente.
 */

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const env = getClientEnv();

  browserClient = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return browserClient;
}
