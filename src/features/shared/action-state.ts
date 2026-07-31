/**
 * Estado de retorno compartido por las Server Actions con formulario.
 *
 * Se devuelve estado en lugar de lanzar: los errores esperables (un campo
 * inválido, un correo ya en uso) son datos que el formulario renderiza, no
 * fallos del programa. Reservar las excepciones para lo inesperado mantiene
 * legible el `catch`.
 *
 * Vivía en `features/auth/actions.ts` hasta la migración a Clerk. Al desaparecer
 * las acciones de autenticación, el tipo se quedó sin casa: lo usan los
 * formularios de administración, que no tienen nada que ver con el auth.
 */
export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** Aplana los errores de zod a un mapa campo → primer mensaje. */
export function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}
