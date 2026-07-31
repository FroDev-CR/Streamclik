import Link from 'next/link';
import { Bell, Clock, ShieldCheck, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Landing pública.
 *
 * Server Component estático: no consulta datos y no envía JavaScript propio al
 * navegador. Es la única página que puede cachearse de forma agresiva.
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
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">
          Stream<span className="text-[--color-accent]">Click</span>
        </span>

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
          Los códigos de tu cuenta compartida, <span className="text-[--color-accent]">al momento</span>.
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
            className="rounded-[--radius-card] border border-[--color-border] bg-[--color-surface] p-5"
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
