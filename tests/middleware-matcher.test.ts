import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * El matcher del middleware debe dejar fuera el webhook de correo.
 *
 * Es el fallo más silencioso y más caro de todo el sistema: si el middleware de
 * Clerk intercepta `/api/webhooks/inbound-email`, el Worker de Cloudflare recibe
 * una **redirección al login** en lugar de un 200. Los correos entran, Cloudflare
 * los da por entregados, y ningún código llega jamás. Ningún test de la
 * aplicación lo detectaría, porque el pipeline en sí sigue funcionando
 * perfectamente.
 *
 * El patrón se lee del archivo fuente en vez de importarlo porque Next exige que
 * `export const config` sea estáticamente analizable: no admite un matcher
 * importado de otro módulo, así que no se puede compartir con el test de la
 * forma habitual. Importar `src/middleware.ts` tampoco sirve — invocaría a
 * `clerkMiddleware()` en tiempo de módulo y exigiría las claves de Clerk.
 */

const FUENTE = readFileSync('src/middleware.ts', 'utf8');

/** Extrae los patrones del array `matcher` del `export const config`. */
function extraerPatrones(): string[] {
  const bloque = FUENTE.match(/matcher:\s*\[([\s\S]*?)\]/);
  if (!bloque?.[1]) throw new Error('No se encontró el matcher en src/middleware.ts');

  return (
    [...bloque[1].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)]
      .map((m) => m[2])
      .filter((p): p is string => Boolean(p))
      // El archivo fuente escapa las barras invertidas para el literal de cadena;
      // al construir el RegExp hay que deshacer ese escape.
      .map((p) => p.replace(/\\\\/g, '\\'))
  );
}

const PATRONES = extraerPatrones();

function middlewareSeAplicaA(ruta: string): boolean {
  return PATRONES.some((patron) => new RegExp(`^${patron}$`).test(ruta));
}

describe('matcher del middleware', () => {
  it('encuentra al menos un patrón', () => {
    expect(PATRONES.length).toBeGreaterThan(0);
  });

  it('NO intercepta el webhook de correo entrante', () => {
    // Si esto falla, ningún código de verificación llegará nunca a producción.
    expect(middlewareSeAplicaA('/api/webhooks/inbound-email')).toBe(false);
  });

  it('NO intercepta ninguna ruta bajo /api/webhooks', () => {
    expect(middlewareSeAplicaA('/api/webhooks/otro-proveedor')).toBe(false);
  });

  it('sí protege las rutas privadas', () => {
    // El middleware debe ejecutarse aquí para redirigir al login. No es la
    // frontera de seguridad —esa es RLS— pero sí la que da una experiencia
    // correcta en vez de un dashboard vacío.
    expect(middlewareSeAplicaA('/dashboard')).toBe(true);
    expect(middlewareSeAplicaA('/admin')).toBe(true);
    expect(middlewareSeAplicaA('/cuenta/abc-123')).toBe(true);
  });

  it('exige sesión en todo el flujo de compra', () => {
    // `/comprar` y `/historial` deben estar en `createRouteMatcher`, no sólo en
    // el matcher del config. Es lo que hace que un visitante sin sesión pase por
    // Clerk y **vuelva a la compra** en vez de aterrizar en el dashboard: sin
    // ello, el enlace «Lo quiero» del catálogo pierde el producto elegido por el
    // camino y la compra se abandona ahí.
    const bloque = FUENTE.match(/createRouteMatcher\(\[([\s\S]*?)\]\)/);
    expect(bloque?.[1], 'no se encontró createRouteMatcher en src/middleware.ts').toBeTruthy();

    const privadas = [...bloque![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    const protege = (ruta: string) =>
      privadas.some((patron) => new RegExp(`^${patron}$`).test(ruta));

    expect(protege('/comprar/netflix')).toBe(true);
    expect(protege('/historial')).toBe(true);
    expect(protege('/dashboard')).toBe(true);
    expect(protege('/admin/pagos')).toBe(true);

    // La portada y el catálogo público siguen abiertos: se explora sin cuenta.
    expect(protege('/')).toBe(false);
    expect(protege('/catalogo')).toBe(false);
  });

  it('no se ejecuta sobre los assets estáticos', () => {
    // Ejecutarlo por cada archivo de un bundle sólo añade latencia.
    expect(middlewareSeAplicaA('/_next/static/chunks/main.js')).toBe(false);
    expect(middlewareSeAplicaA('/favicon.ico')).toBe(false);
    expect(middlewareSeAplicaA('/logo.png')).toBe(false);
  });
});
