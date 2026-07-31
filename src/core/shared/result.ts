/**
 * Result<T, E> — errores como valores.
 *
 * Los casos de uso devuelven Result en lugar de lanzar excepciones para los
 * errores *esperables* (correo duplicado, cuenta inexistente, perfil ya
 * asignado). Tres razones concretas:
 *
 * 1. TypeScript no tipa las excepciones: `throw` no aparece en la firma, así que
 *    quien llama no sabe qué puede fallar hasta que falla en producción.
 * 2. Obliga a tratar el fallo en el punto de la llamada. Un `try/catch` olvidado
 *    es invisible; un `if (!result.ok)` que falta lo señala el compilador al
 *    acceder a `.value`.
 * 3. En el webhook, la diferencia entre "duplicado" (responder 200) y "Postgres
 *    caído" (responder 500 para que el proveedor reintente) es una decisión de
 *    negocio, no un accidente de control de flujo.
 *
 * Las excepciones se reservan para lo genuinamente inesperado: fallos de red,
 * bugs, invariantes rotas. Eso sí debe propagarse y ser observado.
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** Transforma el valor de éxito y deja el error intacto. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Encadena operaciones que a su vez pueden fallar, sin anidar condicionales. */
export function flatMap<T, U, E>(
  r: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

/** Extrae el valor o devuelve el sustituto indicado. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}
