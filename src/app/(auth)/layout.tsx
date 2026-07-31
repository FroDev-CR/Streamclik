import Link from 'next/link';

import { Logo } from '@/components/logo';
import { ShaderBackground } from '@/components/shader-background';
import { ShineBorder } from '@/components/ui/shine-border';

/**
 * Layout de las pantallas de autenticación.
 *
 * Centrado y sin navegación: durante el inicio de sesión no hay nada más que
 * hacer, y cada enlace adicional es una vía para abandonar el flujo.
 *
 * La tarjeta va sobre el fondo animado con un velo oscuro y desenfoque. El velo
 * no es decorativo: el shader recorre amarillos muy claros, y sin él el texto
 * gris del formulario perdería contraste cada vez que la onda pasa por debajo.
 * Con el velo, el contraste no depende del fotograma.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <ShaderBackground />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[--color-canvas]/72 backdrop-blur-[2px]" />

      <Link href="/" className="mb-8">
        <Logo className="h-12 w-auto" priority />
      </Link>

      <ShineBorder className="max-w-sm bg-[--color-surface]/85 backdrop-blur-xl">
        <div className="p-6">{children}</div>
      </ShineBorder>
    </main>
  );
}
