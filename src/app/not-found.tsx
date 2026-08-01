import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Página 404.
 *
 * También la ven los usuarios que intentan abrir una cuenta que no tienen
 * asignada: `notFound()` en lugar de un 403 evita confirmar que esa cuenta
 * existe, lo que permitiría enumerar el inventario probando identificadores.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-lg font-semibold">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
        El contenido que buscas no existe o no tienes acceso a él.
      </p>
      <Link href="/dashboard">
        <Button>Ir a mis cuentas</Button>
      </Link>
    </main>
  );
}
