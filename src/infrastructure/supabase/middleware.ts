import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresco de sesión y guardias de ruta.
 *
 * Dos detalles de implementación son la diferencia entre que funcione y que
 * falle de forma intermitente:
 *
 * 1. **Se devuelve el MISMO objeto `NextResponse`** que se le pasó al cliente de
 *    Supabase. El SDK escribe sobre él las cookies del token refrescado. Crear
 *    un `NextResponse` nuevo al final descarta ese refresco y el usuario pierde
 *    la sesión cada hora — un bug que no aparece en desarrollo porque las
 *    sesiones son recientes.
 *
 * 2. **Se usa `getUser()` y no `getSession()`.** `getSession()` decodifica la
 *    cookie sin verificar su firma contra el servidor de Auth, así que una
 *    cookie manipulada pasaría el chequeo. `getUser()` valida contra Supabase.
 *    En una frontera de seguridad, esa diferencia lo es todo.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/cuenta'];
const AUTH_ROUTES = ['/login', '/registro', '/recuperar'];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Se conserva el destino para volver a él tras iniciar sesión, en lugar de
    // dejar siempre al usuario en el dashboard.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
