import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind resolviendo los conflictos.
 *
 * `clsx` gestiona las clases condicionales; `twMerge` resuelve las colisiones de
 * la misma propiedad. Sin `twMerge`, `cn('p-4', 'p-2')` produciría ambas clases y
 * el resultado dependería del orden en el CSS generado, no del orden en el que
 * se escribieron. Es lo que permite que un componente acepte `className` y que
 * quien lo usa pueda sobrescribir de verdad los estilos base.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Fecha y hora en formato local español, para el historial de PIN. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Antigüedad en lenguaje natural ("hace 3 min").
 *
 * Para un código con 15 minutos de vida, "hace 3 min" comunica la urgencia mucho
 * mejor que una marca de tiempo absoluta que el usuario tiene que comparar
 * mentalmente con la hora actual.
 */
export function formatRelativeTime(value: string | Date, now = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 10) return 'ahora mismo';
  if (seconds < 60) return `hace ${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;

  return formatDateTime(date);
}

/** Cuenta atrás en `m:ss` para la expiración del PIN. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
