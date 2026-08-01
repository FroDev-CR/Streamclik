import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Insignia de estado.
 *
 * Sobre fondo crema los tonos translúcidos del tema oscuro perdían casi todo el
 * contraste, así que aquí se usan colores planos con borde negro: se distinguen
 * igual de bien en pantalla que impresos en blanco y negro, que es una buena
 * prueba de que el estado no depende sólo del color.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--color-border)] px-2.5 py-0.5 ' +
    'font-[family-name:var(--font-display)] text-[0.68rem] font-extrabold uppercase tracking-wider',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--color-canvas)] text-[var(--color-content)]',
        success: 'bg-[var(--color-brand-yellow)] text-[var(--color-content)]',
        warning: 'bg-[var(--color-warning)] text-white',
        danger: 'bg-[var(--color-danger)] text-white',
        accent: 'bg-[var(--color-accent)] text-white',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
