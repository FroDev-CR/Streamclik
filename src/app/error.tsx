'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Límite de error de la aplicación.
 *
 * Muestra un mensaje genérico a propósito: `error.message` puede contener
 * detalles internos (nombres de tabla, fragmentos de consulta) que no deben
 * llegar al usuario. El `digest` sí se muestra, porque es un identificador
 * opaco que permite localizar el error concreto en los logs cuando alguien
 * reporta el problema.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Error no controlado en la interfaz',
        digest: error.digest,
        timestamp: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-lg font-semibold">Algo ha fallado</h1>
      <p className="max-w-sm text-sm text-[--color-content-muted]">
        No hemos podido cargar esta página. Vuelve a intentarlo en unos segundos.
      </p>

      {error.digest && (
        <code className="text-xs text-[--color-content-subtle]">Referencia: {error.digest}</code>
      )}

      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
