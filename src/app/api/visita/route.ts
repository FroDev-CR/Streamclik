import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/infrastructure/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Registra una visita a una página pública.
 *
 * Lo llama `<VisitTracker/>` desde el navegador. Se hace con una petición
 * aparte y no desde el render del servidor por dos motivos: las páginas
 * públicas se cachean —la portada se revalida cada cinco minutos, así que un
 * contador en el render sumaría una visita cada cinco minutos en vez de una por
 * persona— y así el contador nunca puede retrasar ni romper la página.
 *
 * El país sale de `x-vercel-ip-country`, que Vercel añade en el borde. Nunca se
 * guarda la IP: el país es el dato útil y lo demás sería información personal
 * que habría que justificar, proteger y borrar.
 *
 * `runtime = 'nodejs'` porque el cliente administrativo importa `server-only` y
 * usa la clave de servicio.
 */
export const runtime = 'nodejs';

/** Rutas privadas: lo que pasa dentro del panel no es tráfico de la web. */
const RUTAS_IGNORADAS = ['/admin', '/dashboard', '/cuenta', '/perfil', '/api'];

/** Normaliza la ruta y descarta lo que no debe contarse. */
function rutaValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;

  // Sólo rutas del propio sitio. Sin esto, cualquiera podría llenar la tabla de
  // basura con un bucle desde la consola.
  if (!valor.startsWith('/') || valor.startsWith('//')) return null;

  // Se corta la cadena de consulta: puede llevar códigos de invitación.
  const ruta = valor.split('?')[0]!.split('#')[0]!.slice(0, 120);

  if (RUTAS_IGNORADAS.some((prefijo) => ruta.startsWith(prefijo))) return null;

  return ruta;
}

/**
 * De la URL de origen sólo interesa el dominio.
 *
 * «instagram.com» dice todo lo que hace falta saber; la URL completa a veces
 * lleva identificadores de campaña que apuntan a una persona concreta.
 */
function dominioOrigen(valor: unknown, host: string | null): string | null {
  if (typeof valor !== 'string' || valor === '') return null;

  try {
    const { hostname } = new URL(valor);
    // Navegar dentro del propio sitio no es una fuente de tráfico.
    if (host && hostname === host) return null;
    return hostname.slice(0, 100);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const cuerpo = (await request.json()) as {
      path?: unknown;
      referrer?: unknown;
      sessionId?: unknown;
    };

    const path = rutaValida(cuerpo.path);
    if (!path) {
      // 204 y no 400: un rechazo silencioso. El navegador no tiene nada que
      // hacer con el error y devolver 400 llenaría la consola del visitante.
      return new NextResponse(null, { status: 204 });
    }

    const sessionId =
      typeof cuerpo.sessionId === 'string' && cuerpo.sessionId.length <= 64
        ? cuerpo.sessionId
        : null;

    if (!sessionId) return new NextResponse(null, { status: 204 });

    const host = request.headers.get('host');
    const country = request.headers.get('x-vercel-ip-country');

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from('page_views').insert({
      path,
      country: country && country.length === 2 ? country : null,
      referrer: dominioOrigen(cuerpo.referrer, host),
      session_id: sessionId,
    });

    if (error) {
      logger.warn('No se pudo registrar la visita', { error: error.message });
    }
  } catch (error) {
    // Un contador que falla no puede afectar a nadie. Se registra y se responde
    // que todo bien: el visitante no tiene nada que ver con esto.
    logger.warn('Fallo al procesar la visita', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new NextResponse(null, { status: 204 });
}
