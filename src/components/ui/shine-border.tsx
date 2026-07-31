'use client';

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Borde animado con un degradado que recorre el perímetro.
 *
 * El truco es un pseudo-elemento con `mask-composite: exclude`: se pinta un
 * degradado radial sobre todo el rectángulo y luego se recorta el interior,
 * dejando visible sólo el marco. Es lo que permite que el borde tenga un
 * degradado en movimiento sin envolver el contenido en un segundo elemento ni
 * repintarlo en cada fotograma.
 *
 * `motion-safe:` deja el borde quieto para quien pide movimiento reducido. El
 * marco sigue viéndose; lo que se detiene es el recorrido.
 *
 * Adaptado del componente publicado en 21st.dev. Se dejaron fuera el `Timeline`
 * que lo acompañaba y su dependencia `dicons`: eran contenido de ejemplo de una
 * agencia de diseño, y `dicons` duplicaría el paquete de iconos que el proyecto
 * ya usa (lucide-react).
 */

type ColorProp = string | string[];

interface ShineBorderProps {
  /** Radio del marco, en píxeles. Debe acompañar al redondeo del contenedor. */
  borderRadius?: number;
  borderWidth?: number;
  /** Duración de una vuelta completa del degradado, en segundos. */
  duration?: number;
  color?: ColorProp;
  className?: string;
  children: ReactNode;
}

export function ShineBorder({
  borderRadius = 14,
  borderWidth = 1,
  duration = 14,
  // Azul y ámbar de la marca: el mismo par del logotipo y del fondo animado.
  color = ['#1e7fff', '#f5a800'],
  className,
  children,
}: ShineBorderProps) {
  return (
    <div
      style={{ '--border-radius': `${borderRadius}px` } as CSSProperties}
      className={cn(
        'relative w-full rounded-[--border-radius] bg-[--color-surface] text-[--color-content]',
        className,
      )}
    >
      <div
        aria-hidden
        style={
          {
            '--border-width': `${borderWidth}px`,
            '--border-radius': `${borderRadius}px`,
            '--shine-pulse-duration': `${duration}s`,
            '--mask-linear-gradient':
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            '--background-radial-gradient': `radial-gradient(transparent,transparent, ${
              Array.isArray(color) ? color.join(',') : color
            },transparent,transparent)`,
          } as CSSProperties
        }
        className={
          'pointer-events-none absolute inset-0 size-full rounded-[--border-radius] ' +
          'p-[--border-width] will-change-[background-position] ' +
          '[background-image:--background-radial-gradient] [background-size:300%_300%] ' +
          '[mask:--mask-linear-gradient] [mask-composite:exclude] ' +
          '[-webkit-mask-composite:xor] ' +
          'motion-safe:animate-[shine-pulse_var(--shine-pulse-duration)_infinite_linear]'
        }
      />
      {children}
    </div>
  );
}
