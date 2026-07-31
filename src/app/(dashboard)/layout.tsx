import { SignOutButton } from '@clerk/nextjs';
import Link from 'next/link';
import { LayoutGrid, LogOut, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { requireUser } from '@/features/auth/session';

/**
 * Todas las rutas bajo este layout dependen de la cookie de sesión, así que
 * nunca deben generarse de forma estática ni cachearse: una página de dashboard
 * prerenderizada sería el dashboard de *alguien*, servido a todo el mundo.
 *
 * Declararlo aquí (y no dejar que Next lo deduzca al encontrar `cookies()`)
 * también hace el build reproducible: sin esta línea, el intento de
 * prerenderizado evalúa el módulo de entorno antes de llegar al acceso a
 * cookies, y un build sin variables configuradas falla con un error de
 * prerender que no señala la causa real.
 */
export const dynamic = 'force-dynamic';

/**
 * Layout del área privada.
 *
 * `requireUser()` aquí es **defensa en profundidad**, no la frontera de
 * seguridad. El middleware ya redirige a quien no tiene sesión, y RLS ya
 * impediría leer datos ajenos. Lo que aporta esta llamada es garantizar que
 * ninguna página hija tenga que preocuparse por un usuario nulo.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.profile.role === 'admin';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-[--color-border] bg-[--color-canvas]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-5">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Stream<span className="text-[--color-accent]">Click</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <LayoutGrid aria-hidden className="size-4" />
                <span className="hidden sm:inline">Mis cuentas</span>
              </Button>
            </Link>

            {/* El enlace sólo se muestra a administradores, pero la protección
                real está en `requireAdmin()` y en RLS: ocultar un enlace no
                impide escribir la URL a mano. */}
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm">
                  <Settings aria-hidden className="size-4" />
                  <span className="hidden sm:inline">Administración</span>
                </Button>
              </Link>
            )}

            {/* Clerk revoca la sesión en su servidor, no sólo borra la cookie
                local: un token copiado antes del cierre deja de servir. Y sigue
                sin ser un enlace navegable, así que no puede dispararse desde
                una imagen o un prefetch. */}
            <SignOutButton redirectUrl="/login">
              <Button type="button" variant="ghost" size="sm" aria-label="Cerrar sesión">
                <LogOut aria-hidden className="size-4" />
              </Button>
            </SignOutButton>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
