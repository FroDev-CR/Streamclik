import Link from 'next/link';
import {
  BadgeCheck,
  Bell,
  Clock,
  Inbox,
  MonitorPlay,
  ScanLine,
  ShieldCheck,
  UserCheck,
  Zap,
} from 'lucide-react';

import { Logo } from '@/components/logo';
import { ShaderBackground } from '@/components/shader-background';
import { Button } from '@/components/ui/button';

/**
 * Landing pública.
 *
 * Server Component: no consulta datos. El único JavaScript propio que llega al
 * navegador es el del fondo animado, aislado en su componente de cliente.
 *
 * El shader vive **sólo en el hero**. Cubriendo la página entera obligaba a
 * poner un velo sobre todo el contenido, y entonces el degradado se percibía
 * como suciedad detrás del texto en vez de como una cabecera con carácter.
 * Acotado al hero funciona al revés: la sección de arriba llama la atención y el
 * resto se lee sobre fondo sólido, sin pelearse con nada.
 */

const VENTAJAS = [
  {
    icon: BadgeCheck,
    title: 'Cuentas originales',
    body: 'Perfiles en cuentas contratadas directamente con el proveedor. Nada de accesos revendidos en cadena que caen a la semana.',
  },
  {
    icon: Zap,
    title: 'Entrega automática',
    body: 'Pagas y el perfil queda asignado a tu usuario en el momento. Sin esperar a que alguien te conteste el mensaje.',
  },
  {
    icon: ScanLine,
    title: 'Códigos al instante',
    body: 'Cuando el servicio pide verificación, el código aparece solo en tu panel. Sin recargar y sin pedírselo a nadie.',
  },
  {
    icon: ShieldCheck,
    title: 'Cada cliente ve lo suyo',
    body: 'El aislamiento se aplica dentro de la base de datos, no en la pantalla. Nadie puede ver los códigos de otro perfil.',
  },
  {
    icon: Clock,
    title: 'Historial completo',
    body: 'Todos los códigos recibidos con su fecha y hora, para resolver cualquier duda sobre un acceso.',
  },
  {
    icon: Bell,
    title: 'Avisos donde estés',
    body: 'Preparado para notificaciones por WhatsApp, Telegram y push cuando no tengas la web abierta.',
  },
];

const PASOS = [
  {
    icon: UserCheck,
    title: 'Creas tu cuenta',
    body: 'Te registras con tu correo. Un minuto y sin tarjeta.',
  },
  {
    icon: MonitorPlay,
    title: 'Recibes tu perfil',
    body: 'Te asignamos un perfil con sus credenciales, listo para entrar.',
  },
  {
    icon: Inbox,
    title: 'Nosotros recibimos el correo',
    body: 'El código de verificación llega a nuestro buzón, no al tuyo.',
  },
  {
    icon: ScanLine,
    title: 'Lo ves en tu panel',
    body: 'Aparece en pantalla en cuanto llega, mientras sigue siendo válido.',
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden">
        <ShaderBackground className="pointer-events-none absolute inset-0 -z-20 h-full w-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[--color-canvas]/78" />
        {/* Degradado hacia el color de lienzo en el borde inferior: sin él, el
            shader termina en un corte recto que delata dónde acaba el hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-[--color-canvas]"
        />

        <div className="mx-auto w-full max-w-5xl px-5">
          <header className="flex items-center justify-between py-6">
            <Logo className="h-11 w-auto sm:h-14" priority />

            <nav className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Entrar
                </Button>
              </Link>
              <Link href="/registro">
                <Button size="sm">Crear cuenta</Button>
              </Link>
            </nav>
          </header>

          <div className="py-20 sm:py-28">
            <p className="font-[family-name:--font-display] text-sm font-medium uppercase tracking-[0.2em] text-[--color-brand-amber]">
              Cuentas y perfiles de streaming
            </p>

            <h1 className="mt-4 max-w-3xl text-balance font-[family-name:--font-display] text-5xl font-bold italic leading-[1.05] tracking-tight sm:text-7xl">
              Los códigos de tu cuenta compartida,{' '}
              <span className="text-[--color-brand-amber]">al momento</span>.
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-lg text-[--color-content-muted]">
              Vendemos perfiles originales con entrega automática. Y cuando el servicio pide un
              código de verificación, lo ves en tu panel en tiempo real: sin reenvíos manuales y sin
              códigos caducados.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/registro">
                <Button size="lg">Empezar ahora</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="secondary">
                  Ya tengo cuenta
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- qué vendemos */}
      <section className="mx-auto w-full max-w-5xl px-5 py-20">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:--font-display] text-3xl font-bold italic tracking-tight sm:text-4xl">
            Qué vendemos
          </h2>
          <p className="mt-4 text-pretty text-[--color-content-muted]">
            Perfiles en cuentas de streaming originales, entregados de forma automática. Lo que
            normalmente se gestiona a mano por WhatsApp —asignar el perfil, mandar la contraseña,
            reenviar cada código antes de que caduque— aquí ocurre solo.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VENTAJAS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-[--radius-card] border border-[--color-border] bg-[--color-surface] p-6 transition-colors hover:border-[--color-border-strong]"
            >
              <Icon aria-hidden className="size-5 text-[--color-accent]" />
              <h3 className="mt-4 font-[family-name:--font-display] text-lg font-semibold">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[--color-content-muted]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- cómo funciona */}
      <section className="border-y border-[--color-border] bg-[--color-surface]/40">
        <div className="mx-auto w-full max-w-5xl px-5 py-20">
          <h2 className="font-[family-name:--font-display] text-3xl font-bold italic tracking-tight sm:text-4xl">
            Cómo funciona
          </h2>

          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[--color-accent]/40 bg-[--color-accent-soft] text-[--color-accent]">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  {/* El número va como texto decorativo y no dentro del <li>
                      visible: el orden ya lo comunica la lista ordenada a quien
                      usa lector de pantalla. */}
                  <span
                    aria-hidden
                    className="font-[family-name:--font-display] text-3xl font-bold italic text-[--color-border-strong]"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                <h3 className="mt-4 font-[family-name:--font-display] text-lg font-semibold">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[--color-content-muted]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- cierre y pie */}
      <section className="mx-auto w-full max-w-5xl px-5 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-balance font-[family-name:--font-display] text-3xl font-bold italic tracking-tight sm:text-4xl">
          Deja de reenviar códigos a mano
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-pretty text-[--color-content-muted]">
          Crear la cuenta lleva un minuto y no pide tarjeta.
        </p>
        <div className="mt-8 flex justify-center">
          <Link href="/registro">
            <Button size="lg">Crear mi cuenta</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-[--color-border]">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <Logo className="h-7 w-auto opacity-70" />
          <p className="text-xs text-[--color-content-subtle]">
            StreamClick · Cuentas y perfiles de streaming
          </p>
        </div>
      </footer>
    </main>
  );
}
