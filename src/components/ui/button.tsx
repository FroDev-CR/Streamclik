import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Botón del design system.
 *
 * Las variantes se definen con `cva` para que las combinaciones válidas estén
 * tipadas: `variant="primaty"` es un error de compilación, no un botón sin
 * estilo descubierto en producción.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        primary: 'bg-[--color-accent] text-white hover:bg-[--color-accent-hover]',
        secondary:
          'bg-[--color-surface-raised] text-[--color-content] border border-[--color-border-strong] hover:bg-[--color-border]',
        ghost: 'text-[--color-content-muted] hover:bg-[--color-surface-raised] hover:text-[--color-content]',
        danger: 'bg-[--color-danger] text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
      full: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, full, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, full }), className)} {...props} />;
}
