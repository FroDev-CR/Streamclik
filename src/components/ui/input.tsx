import type { InputHTMLAttributes, LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium text-[--color-content-muted]', className)}
      {...props}
    />
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | undefined;
}

export function Input({ className, error, id, ...props }: InputProps) {
  const errorId = error && id ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={id}
        // `aria-invalid` y `aria-describedby` conectan el mensaje de error con el
        // campo para los lectores de pantalla. Sin ellos, el error existe
        // visualmente pero es invisible para quien no ve la pantalla.
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'h-10 w-full rounded-lg border bg-[--color-surface-raised] px-3 text-sm text-[--color-content]',
          'placeholder:text-[--color-content-subtle] transition-colors',
          error ? 'border-[--color-danger]' : 'border-[--color-border-strong]',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-[--color-danger]">
          {error}
        </p>
      )}
    </div>
  );
}
