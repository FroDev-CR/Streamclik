import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente administrativo — OMITE ROW LEVEL SECURITY POR COMPLETO.
 *
 * Usos permitidos, y son sólo dos:
 *
 *   1. El webhook de ingesta de correo
 *      (`src/app/api/webhooks/inbound-email/route.ts`), que necesita escribir en
 *      `verification_pins` sin sesión de usuario.
 *   2. El aviso de pago al operador
 *      (`src/infrastructure/notifications/admin-push.ts`), que lee las
 *      suscripciones push de los administradores.
 *   3. El borrado de un cliente (`deleteClientAction`), que necesita que el
 *      DELETE ocurra de verdad. Con el cliente normal, un borrado que las
 *      políticas no dejan pasar **no da error**: borra cero filas y responde
 *      correctamente, y ese silencio es indistinguible del éxito desde la
 *      aplicación. La autorización se comprueba antes y de forma explícita en
 *      TypeScript.
 *
 * El segundo caso merece explicación, porque a primera vista parece justo lo que
 * esta advertencia prohíbe: lo dispara la petición de un cliente. La diferencia
 * es que el dato que se lee **no es suyo ni debe serlo** —son los dispositivos
 * del operador— y ninguna política puede autorizarlo sin abrir esa tabla a
 * cualquiera. No es RLS sorteado por comodidad, es una operación que pertenece
 * al sistema y no al usuario que la desencadena.
 *
 * Fuera de esos dos casos, NUNCA usarlo para atender la petición de un usuario.
 * Si un dato es visible para alguien autenticado, debe leerse con
 * `createSupabaseServerClient()` para que RLS aplique. Este cliente sortea todas
 * las políticas descritas en docs/adr/0003.
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
