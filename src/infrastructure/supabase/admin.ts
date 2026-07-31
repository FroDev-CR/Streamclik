import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente administrativo — OMITE ROW LEVEL SECURITY POR COMPLETO.
 *
 * Uso permitido: exclusivamente el webhook de ingesta de correo
 * (`src/app/api/webhooks/inbound-email/route.ts`), que necesita escribir en
 * `verification_pins` sin sesión de usuario.
 *
 * NUNCA usarlo para atender una petición de un usuario. Si un dato es visible
 * para alguien autenticado, debe leerse con `createSupabaseServerClient()` para
 * que RLS aplique. Este cliente sortea todas las políticas descritas en
 * docs/adr/0003.
 *
 * `import 'server-only'` es la protección de verdad: si algún import lo arrastra
 * hacia un bundle de cliente, el build falla en lugar de publicar la llave
 * maestra de la base de datos en un archivo JavaScript público.
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // Sin sesión ni refresco: este cliente no representa a ningún usuario y
      // persistir estado entre invocaciones sería una fuente de fugas entre
      // peticiones en un entorno serverless.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
