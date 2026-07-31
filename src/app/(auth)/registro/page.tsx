import type { Metadata } from 'next';
import Link from 'next/link';

import { signUpAction } from '@/features/auth/actions';
import { AuthForm } from '@/features/auth/components/auth-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Crear cuenta</h1>
      <p className="mt-1 text-sm text-[--color-content-muted]">
        Te enviaremos un correo para confirmar tu dirección
      </p>

      <div className="mt-6">
        <AuthForm action={signUpAction} mode="signup" />
      </div>

      <p className="mt-5 text-sm text-[--color-content-subtle]">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-[--color-accent-hover] hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
