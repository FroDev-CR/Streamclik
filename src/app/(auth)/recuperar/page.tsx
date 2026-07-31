import type { Metadata } from 'next';
import Link from 'next/link';

import { requestPasswordResetAction } from '@/features/auth/actions';
import { AuthForm } from '@/features/auth/components/auth-form';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-[--color-content-muted]">
        Introduce tu correo y te enviaremos un enlace para restablecerla
      </p>

      <div className="mt-6">
        <AuthForm action={requestPasswordResetAction} mode="reset" />
      </div>

      <p className="mt-5 text-sm text-[--color-content-subtle]">
        <Link href="/login" className="text-[--color-accent-hover] hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  );
}
