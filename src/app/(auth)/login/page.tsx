import type { Metadata } from 'next';
import Link from 'next/link';

import { signInAction } from '@/features/auth/actions';
import { AuthForm } from '@/features/auth/components/auth-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

/**
 * En Next.js 15 `searchParams` es una promesa: forma parte del modelo de
 * renderizado dinámico, que permite empezar a renderizar la parte estática de la
 * página antes de resolver los parámetros.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Sólo se propaga si es una ruta interna: un `next` con URL absoluta
  // convertiría el login en un redirector abierto, útil para phishing. La Server
  // Action lo vuelve a comprobar, porque el campo oculto es manipulable.
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : undefined;

  return (
    <>
      <h1 className="text-xl font-semibold">Entrar</h1>
      <p className="mt-1 text-sm text-[--color-content-muted]">
        Accede para ver tus cuentas y códigos
      </p>

      <div className="mt-6">
        <AuthForm action={signInAction} mode="signin" nextPath={safeNext} />
      </div>

      <div className="mt-5 flex flex-col gap-2 text-sm">
        <Link href="/recuperar" className="text-[--color-content-muted] hover:text-[--color-content]">
          He olvidado mi contraseña
        </Link>
        <span className="text-[--color-content-subtle]">
          ¿No tienes cuenta?{' '}
          <Link href="/registro" className="text-[--color-accent-hover] hover:underline">
            Regístrate
          </Link>
        </span>
      </div>
    </>
  );
}
