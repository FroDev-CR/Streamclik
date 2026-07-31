import { z } from 'zod';

/**
 * Esquemas de validación de los formularios de autenticación.
 *
 * Se validan **en el servidor**, dentro de la Server Action. La validación del
 * navegador es una comodidad para el usuario; el `FormData` que llega a una
 * Server Action es arbitrario y puede fabricarse a mano, así que el servidor no
 * puede confiar en nada de lo que venga del cliente.
 */

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Introduce un correo electrónico válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Introduce tu nombre').max(120),
  email: z.string().trim().toLowerCase().email('Introduce un correo electrónico válido'),
  // Ocho caracteres es el mínimo recomendado por el NIST. No se exigen reglas de
  // composición (mayúsculas, símbolos): la evidencia muestra que empujan a los
  // usuarios hacia patrones predecibles como "Password1!" sin ganar entropía real.
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede superar los 72 caracteres'),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Introduce un correo electrónico válido'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
