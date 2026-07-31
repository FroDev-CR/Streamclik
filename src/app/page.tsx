import Link from 'next/link';
import { Bell, Clock, ShieldCheck, Zap } from 'lucide-react';

import { Logo } from '@/components/logo';
import { ShaderBackground } from '@/components/shader-background';
import { Button } from '@/components/ui/button';

/**
 * Landing pública.
 *
 * Server Component: no consulta datos. El único JavaScript propio que envía al
 * navegador es el del fondo animado, que se monta como componente de cliente
 * aparte para no arrastrar el resto de la página a la hidratación.
 */

const FEATURES = [
  {
    icon: Zap,
    title: 'Códigos al instante',
    body: 'El código aparece en tu pantalla en cuanto Netflix lo envía. Sin recargar, sin esperar a que alguien te lo reenvíe.',
  },
  {
    icon: ShieldCheck,
    title: 'Cada cliente ve lo suyo',
    body: 'El aislamiento se aplica en la base de datos, no en la interfaz. Nadie puede ver los códigos de otra cuenta.',
  },
  {
    icon: Clock,
    title: 'Historial completo',
    body: 'Todos los códigos recibidos, con fecha y hora, para resolver cualquier duda sobre un acceso.',
  },
  {
    icon: Bell,
    title: 'Avisos donde estés',
    body: 'Preparado para notificaciones por WhatsApp, Telegram y push cuando no tengas la web abierta.',
  },
];

export default function LandingPage() {
  return (
    <main className="relative isolate mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
      {/* El fondo se sale del contenedor centrado a propósito: `fixed` lo ancla
          al viewport para que la onda cubra todo el ancho y no se recorte a los
          max-w-5xl del contenido. */}
      <ShaderBackground className="pointer-events-none fixed inset-0 -z-20 h-full w-full" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[--color-canvas]/80 backdrop-blur-[3px]"
      />

      <header className="flex items-center justify-between">
        <Logo className="h-8 w-auto" priority />

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

      <section className="flex flex-1 flex-col justify-center py-16 sm:py-24">
        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Los códigos de tu cuenta compartida,{' '}
          <span className="text-[--color-brand-amber]">al momento</span>.
        </h1>

        <p className="mt-5 max-w-xl text-pretty text-[--color-content-muted]">
          StreamClick recibe el correo de verificación, extrae el código automáticamente y lo
          muestra en tu panel en tiempo real. Sin reenvíos manuales y sin códigos caducados.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/registro">
            <Button size="lg">Empezar ahora</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">
              Ya tengo cuenta
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-[--radius-card] border border-[--color-border] bg-[--color-surface]/85 p-5 backdrop-blur-xl"
          >
            <Icon aria-hidden className="size-5 text-[--color-accent]" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1.5 text-sm text-[--color-content-muted]">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-[--color-border] pt-6 text-xs text-[--color-content-subtle]">
        StreamClick · Panel de gestión de cuentas compartidas
      </footer>
    </main>
  );
}
