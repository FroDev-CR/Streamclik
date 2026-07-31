import type { NextRequest } from 'next/server';

import { updateSession } from '@/infrastructure/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Se excluyen los assets estáticos y las imágenes: el middleware refresca el
   * token de Supabase en cada ejecución, y hacerlo para cada archivo de un
   * bundle añadiría decenas de llamadas innecesarias al servidor de Auth por
   * cada carga de página.
   *
   * El webhook de correo entrante también queda fuera: no tiene sesión de
   * usuario, se autentica con firma HMAC, y pasarlo por el middleware sólo
   * añadiría latencia a la ruta más sensible al tiempo del sistema.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
