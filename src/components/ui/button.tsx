import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Botón del design system, en la clave neo-brutalista de la landing.
 *
 * Las variantes se definen con `cva` para que las combinaciones válidas estén
 * tipadas: `variant="primaty"` es un error de compilación, no un botón sin
 * estilo descubierto en producción.
 *
 * El gesto de la identidad es la sombra dura desplazada que se hunde al pulsar
 * (`active:` mueve el botón y encoge la sombra). Es retroalimentación física
 * gratuita: en el panel se encadenan varias acciones seguidas y conviene que
 * cada pulsación se note sin esperar a que el servidor responda.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--color-border)] ' +
    'font-[family-name:var(--font-display)] font-extrabold uppercase tracking-wide ' +
    'transition-[transform,box-shadow,background-color] duration-100 ' +
    'disabled:pointer-events-none disabled:opacity-45 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        // La sombra amarilla sobre el negro es el par de marca de la portada.
        primary:
          'bg-[var(--color-content)] text-[var(--color-surface)] shadow-[4px_4px_0_var(--color-brand-yellow)] ' +
          'hover:bg-[#1a1a1a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--color-brand-yellow)]',
        secondary:
          'bg-[var(--color-surface)] text-[var(--color-content)] shadow-[4px_4px_0_var(--color-border)] ' +
          'hover:bg-[var(--color-canvas)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--color-border)]',
        accent:
          'bg-[var(--color-accent)] text-white shadow-[4px_4px_0_var(--color-border)] ' +
          'hover:bg-[var(--color-accent-hover)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--color-border)]',
        // Sin borde ni sombra: para acciones terciarias que no deben competir
        // visualmente con la principal de la pantalla.
        ghost:
          'border-transparent text-[var(--color-content-muted)] shadow-none ' +
          'hover:bg-[var(--color-content)]/8 hover:text-[var(--color-content)]',
        danger:
          'bg-[var(--color-danger)] text-white shadow-[4px_4px_0_var(--color-border)] ' +
          'hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--color-border)]',
      },
      size: {
        sm: 'h-9 px-3 text-[0.7rem]',
        md: 'h-11 px-5 text-xs',
        lg: 'h-13 px-7 text-sm',
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
