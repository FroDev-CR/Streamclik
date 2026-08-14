import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Middleware de sesión.
 *
 * Con Clerk desaparece el baile de cookies que exigía Supabase Auth: ya no hay
 * que devolver el mismo objeto `NextResponse` que creó el cliente de Supabase
 * para no perder el token refrescado, que era el origen de aquellas sesiones que
 * se caían cada hora sin dar señales en desarrollo.
 *
 * Esto es **defensa en profundidad**, no la frontera de seguridad. Esa la ponen
 * las políticas RLS (ADR-0003): si una ruta nueva se olvidara de este matcher,
 * Postgres seguiría sin devolver filas ajenas. Lo que aporta aquí es una
 * redirección limpia al login en vez de un dashboard vacío sin explicación.
 */

const esRutaPrivada = createRouteMatcher([
  '/dashboard(.*)',
  '/cuenta(.*)',
  '/admin(.*)',
  '/comprar(.*)',
  '/renovar(.*)',
  '/carrito(.*)',
  '/historial(.*)',
  '/configuracion(.*)',
  '/soporte(.*)',
  '/bienvenida(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (esRutaPrivada(request)) {
    await auth.protect();
  }
});

export const config = {
  /**
   * Se excluyen los assets estáticos: ejecutar el middleware por cada archivo de
   * un bundle sólo añade latencia.
   *
   * El webhook de correo entrante queda fuera a propósito. No tiene sesión: se
   * autentica con firma HMAC. Si pasara por Clerk, el Worker de Cloudflare
   * recibiría una redirección al login en lugar de un 200, y **ningún código
   * llegaría jamás** — sin que ningún test de la aplicación lo detectara.
   *
   * `sw.js` y el manifiesto también quedan fuera. El navegador los pide sin
   * cookies al comprobar si hay una versión nueva del service worker: si esa
   * petición pasara por Clerk y volviera una redirección, la aplicación dejaría
   * de ser instalable y de actualizarse, otra vez sin ningún error visible.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
