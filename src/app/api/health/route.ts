import { NextResponse } from 'next/server';

/**
 * Comprobación de vida para monitorización externa.
 *
 * Deliberadamente NO consulta la base de datos: es un liveness check, no un
 * readiness check. Un monitor que caiga cuando Supabase tiene un pico de latencia
 * genera alertas que no corresponden a un fallo de la aplicación, y las alertas
 * ruidosas acaban siendo ignoradas justo cuando importan.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    service: 'streamclick',
    timestamp: new Date().toISOString(),
  });
}
