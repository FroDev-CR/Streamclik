import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tarjeta del design system, en la clave neo-brutalista de la landing.
 *
 * Borde grueso y sombra dura desplazada en lugar de sombra difusa: es el mismo
 * recurso que usan las tarjetas de la portada, así que el panel y la web pública
 * se leen como el mismo producto.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border-[3px] border-[var(--color-border)] bg-[var(--color-surface)]',
        'shadow-[6px_6px_0_var(--color-border)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // La línea inferior separa cabecera de contenido con el mismo trazo que
        // el borde exterior, en vez de con un cambio de fondo.
        'flex flex-col gap-1 border-b-2 border-[var(--color-border)] p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'font-[family-name:var(--font-display)] text-lg font-black uppercase tracking-tight text-[var(--color-content)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-[var(--color-content-muted)]', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-3 border-t-2 border-[var(--color-border)] p-5', className)}
      {...props}
    />
  );
}
