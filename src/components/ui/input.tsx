import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Campos de formulario en la clave neo-brutalista de la landing.
 *
 * El foco no se marca con un halo difuso sino con el mismo desplazamiento y
 * sombra dura que usan los botones: en un formulario largo como el alta de
 * cuentas, saber en qué campo estás debe leerse de un vistazo.
 */

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'font-[family-name:var(--font-display)] text-[0.72rem] font-extrabold uppercase tracking-wider text-[var(--color-content)]',
        className,
      )}
      {...props}
    />
  );
}

/** Estilos compartidos por `input` y `select` para que no puedan divergir. */
const controlBase =
  'h-11 w-full rounded-xl border-2 bg-[var(--color-surface)] px-3 text-sm text-[var(--color-content)] ' +
  'transition-[box-shadow,transform,border-color] duration-100 ' +
  'placeholder:text-[var(--color-content-subtle)] ' +
  'focus:outline-none focus:shadow-[3px_3px_0_var(--color-border)] focus:-translate-y-[1px]';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | undefined;
  hint?: string | undefined;
}

export function Input({ className, error, hint, id, ...props }: InputProps) {
  const errorId = error && id ? `${id}-error` : undefined;
  const hintId = hint && id ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={id}
        // `aria-invalid` y `aria-describedby` conectan el mensaje de error con el
        // campo para los lectores de pantalla. Sin ellos, el error existe
        // visualmente pero es invisible para quien no ve la pantalla.
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        className={cn(
          controlBase,
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]',
          className,
        )}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="text-xs leading-snug text-[var(--color-content-muted)]">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-xs font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string | undefined;
}

/**
 * `select` con el mismo tratamiento visual que `Input`.
 *
 * Existe porque el panel tenía los `select` con clases sueltas escritas a mano,
 * y acababan desalineados con los campos de texto contiguos cada vez que se
 * retocaba uno de los dos.
 */
export function Select({ className, error, id, children, ...props }: SelectProps) {
  const errorId = error && id ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          controlBase,
          'cursor-pointer appearance-none pr-9',
          // Flecha dibujada con un SVG embebido: evita depender de la del
          // sistema, que cambia de aspecto entre navegadores.
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23050505' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:14px] bg-[right_0.75rem_center] bg-no-repeat",
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>

      {error && (
        <p id={errorId} className="text-xs font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
