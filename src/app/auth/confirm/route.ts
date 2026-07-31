import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Confirmación de correo y recuperación de contraseña.
 *
 * Es un Route Handler y no una página porque el usuario llega aquí desde un
 * enlace de un correo, sin sesión, y lo único que hace la ruta es canjear el
 * token por una sesión y redirigir. No hay interfaz que renderizar.
 *
 * Los Route Handlers sí pueden escribir cookies, que es exactamente lo que
 * `verifyOtp` necesita hacer para establecer la sesión.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // El motivo más frecuente es un enlace caducado, y el mensaje debe decirlo:
    // "error de autenticación" deja al usuario sin saber que basta con pedir
    // otro correo.
    logger.warn('Fallo al verificar el token de correo', { type, error: error.message });
    return NextResponse.redirect(`${origin}/login?error=enlace_caducado`);
  }

  // Sólo rutas internas: el parámetro viene de la URL y es manipulable, así que
  // aceptar una URL absoluta convertiría esto en un redirector abierto.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  return NextResponse.redirect(`${origin}${safeNext}`);
}
