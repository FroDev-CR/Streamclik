import Link from 'next/link';

/**
 * Layout de las pantallas de autenticación.
 *
 * Centrado y sin navegación: durante el inicio de sesión no hay nada más que
 * hacer, y cada enlace adicional es una vía para abandonar el flujo.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8 text-lg font-semibold tracking-tight">
        Stream<span className="text-[--color-accent]">Click</span>
      </Link>

      <div className="w-full max-w-sm rounded-[--radius-card] border border-[--color-border] bg-[--color-surface] p-6">
        {children}
      </div>
    </main>
  );
}
