'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

import { resetPasswordSchema, signInSchema, signUpSchema } from './schemas';

/**
 * Server Actions de autenticación.
 *
 * Estado de retorno en lugar de excepciones: los errores esperables (credenciales
 * incorrectas, correo en uso) son datos que el formulario renderiza, no fallos.
 *
 * `redirect()` se llama SIEMPRE fuera del `try`. Next implementa la navegación
 * lanzando una excepción `NEXT_REDIRECT`, así que un `catch` que la envuelva la
 * tragaría y el formulario se quedaría quieto, sin navegar y sin mostrar error.
 * Es el error más habitual al escribir Server Actions.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

// -----------------------------------------------------------------------------

export async function signInAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    logger.warn('Intento de inicio de sesión fallido', { email: parsed.data.email });

    // Mensaje genérico deliberadamente: distinguir "no existe ese correo" de
    // "contraseña incorrecta" permite enumerar qué direcciones están registradas
    // en la plataforma.
    return { error: 'Correo electrónico o contraseña incorrectos' };
  }

  const nextPath = String(formData.get('next') ?? '/dashboard');

  // Sin esta invalidación, Next podría servir desde caché el layout renderizado
  // para el usuario anterior en un dispositivo compartido.
  revalidatePath('/', 'layout');

  // Sólo se aceptan rutas internas: un `next` con URL absoluta convertiría el
  // login en un redirector abierto, útil para phishing.
  redirect(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/dashboard');
}

// -----------------------------------------------------------------------------

export async function signUpAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // `full_name` lo recoge el trigger `handle_new_user`. El rol NO se envía
      // desde aquí: aceptarlo del cliente sería una escalada de privilegios
      // auto-servida, y por eso el trigger siempre asigna 'client'.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });

  if (error) {
    logger.warn('Registro fallido', { email: parsed.data.email, error: error.message });
    return { error: 'No se pudo crear la cuenta. Comprueba los datos e inténtalo de nuevo.' };
  }

  return {
    success:
      'Cuenta creada. Revisa tu correo y abre el enlace de confirmación para activarla.',
  };
}

// -----------------------------------------------------------------------------

export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?type=recovery`,
  });

  // Se devuelve el mismo mensaje exista o no la cuenta, por el mismo motivo de
  // enumeración de usuarios que en el inicio de sesión. El error real, si lo hay,
  // no se propaga a la interfaz.
  return {
    success: 'Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.',
  };
}

// -----------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();

  // `signOut()` revoca el refresh token en el servidor de Supabase, no sólo
  // borra la cookie local: una cookie copiada antes del cierre de sesión deja de
  // servir para obtener tokens nuevos.
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}
