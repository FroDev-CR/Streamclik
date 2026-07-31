import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

import { clerkAppearance } from '@/features/auth/clerk-appearance';

export const metadata: Metadata = { title: 'Crear cuenta' };

/**
 * Registro.
 *
 * Catch-all por el mismo motivo que el login: Clerk navega a subrutas para la
 * verificación del correo sin abandonar esta página.
 *
 * El rol no se pide ni se acepta en el alta. Todos los usuarios nacen como
 * `client` y la promoción a administrador se hace por SQL: un formulario que
 * permitiera elegir rol sería una escalada de privilegios auto-servida.
 */
export default function RegistroPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-[family-name:--font-display] text-2xl font-bold italic tracking-tight">Crear cuenta</h1>
        <p className="text-sm text-[--color-content-muted]">
          Necesitarás confirmar tu correo antes de entrar.
        </p>
      </div>

      <SignUp
        appearance={clerkAppearance}
        signInUrl="/login"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
