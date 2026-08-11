import { SignOutButton } from '@clerk/nextjs';
import Link from 'next/link';
import {
  Boxes,
  Inbox,
  KeyRound,
  LayoutGrid,
  LogOut,
  Settings,
  ShoppingBag,
  ShoppingCart,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { WelcomeToast } from '@/features/auth/components/welcome-toast';
import { requireUser } from '@/features/auth/session';
import { countPendingOrders } from '@/features/orders/queries';
import { countPendingPinChangeRequests } from '@/features/pins/queries';

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
 * Navegación por rol.
 *
 * El operador y el cliente usan la misma aplicación pero no tienen nada que
 * hacer en las pantallas del otro: el operador gestiona inventario y el cliente
 * consume su suscripción. Mezclar ambas navegaciones obligaba al operador a
 * pasar por «Mis suscripciones», una pantalla que para él siempre está vacía.
 */
const NAV_CLIENTE = [
  { href: '/dashboard', icono: LayoutGrid, etiqueta: 'Mis suscripciones' },
  { href: '/perfil', icono: UserRound, etiqueta: 'Mi perfil' },
  { href: '/catalogo', icono: ShoppingBag, etiqueta: 'Comprar más' },
  { href: '/carrito', icono: ShoppingCart, etiqueta: 'Carrito' },
] as const;

const NAV_ADMIN = [
  { href: '/admin', icono: Boxes, etiqueta: 'Banco' },
  { href: '/admin/buzon', icono: Inbox, etiqueta: 'Buzón' },
  { href: '/admin/pagos', icono: Wallet, etiqueta: 'Pagos' },
  { href: '/admin/pines', icono: KeyRound, etiqueta: 'Cambios de PIN' },
  { href: '/admin/clientes', icono: Users, etiqueta: 'Clientes' },
  { href: '/admin/plataformas', icono: Settings, etiqueta: 'Configuración' },
] as const;

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

  const enlaces = isAdmin ? NAV_ADMIN : NAV_CLIENTE;
  const inicio = isAdmin ? '/admin' : '/dashboard';

  /**
   * Los avisos de pagos y cambios de PIN por revisar.
   *
   * Son las «notificaciones» de esos dos flujos, y van en la navegación en lugar
   * de en un canal externo: el operador los atiende desde este mismo panel, así
   * que un número junto al enlace le llega antes que un correo. Sólo se
   * consultan para administradores; un cliente pagaría una consulta que además
   * RLS le devolvería vacía.
   */
  const [pagosPendientes, pinesPendientes] = isAdmin
    ? await Promise.all([countPendingOrders(), countPendingPinChangeRequests()])
    : [0, 0];

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-canvas)]">
      <WelcomeToast />
      {/* La barra flota como una tarjeta con borde y sombra dura, igual que la
          navegación de la portada: al pasar de la web pública al panel no debe
          parecer que se cambia de producto. */}
      <header className="sticky top-0 z-20 px-4 pt-4">
        <div className="mx-auto flex min-h-[60px] w-full max-w-5xl items-center justify-between gap-3 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 shadow-[5px_5px_0_var(--color-border)] backdrop-blur">
          <Link href={inicio} aria-label="StreamClick">
            <Logo className="h-8 w-auto" priority />
          </Link>

          {/* Los enlaces visibles dependen del rol, pero la protección real está
              en `requireAdmin()` y en RLS: ocultar un enlace no impide escribir
              la URL a mano. */}
          <nav className="flex items-center gap-1">
            {enlaces.map(({ href, icono: Icono, etiqueta }) => {
              const avisos =
                href === '/admin/pagos'
                  ? pagosPendientes
                  : href === '/admin/pines'
                    ? pinesPendientes
                    : 0;

              return (
                <Link key={href} href={href} className="relative">
                  <Button variant="ghost" size="sm">
                    <Icono aria-hidden className="size-4" />
                    <span className="hidden sm:inline">{etiqueta}</span>
                  </Button>

                  {/* El número va sobre el icono y no como texto al lado porque
                      en móvil la etiqueta se oculta y el aviso desaparecería
                      justo donde más falta hace. */}
                  {avisos > 0 && (
                    <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-danger)] px-1 font-[family-name:var(--font-display)] text-[0.6rem] font-black leading-[14px] text-white">
                      {avisos > 9 ? '9+' : avisos}
                      <span className="sr-only"> {etiqueta.toLowerCase()} por revisar</span>
                    </span>
                  )}
                </Link>
              );
            })}

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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
