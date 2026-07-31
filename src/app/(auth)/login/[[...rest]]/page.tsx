import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';

import { clerkAppearance } from '@/features/auth/clerk-appearance';

export const metadata: Metadata = { title: 'Entrar' };

/**
 * Inicio de sesión.
 *
 * La ruta es un catch-all (`[[...rest]]`) porque Clerk navega internamente a
 * subrutas — verificación en dos pasos, recuperación de contraseña — sin salir
 * de esta página. Con una ruta fija, esos pasos darían 404 justo en mitad del
 * flujo, y sólo para los usuarios que activaran 2FA o olvidaran la contraseña:
 * el subconjunto que menos aparece en las pruebas manuales.
 *
 * `/recuperar` desapareció como pantalla propia: Clerk resuelve el
 * restablecimiento dentro de este mismo componente.
 */
export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-[--color-content-muted]">
          Accede para ver los códigos de tus perfiles.
        </p>
      </div>

      <SignIn
        appearance={clerkAppearance}
        signUpUrl="/registro"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
