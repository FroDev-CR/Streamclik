import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = { title: 'Sin conexión' };

/**
 * Página de respaldo cuando el teléfono se queda sin datos.
 *
 * La precarga el service worker al instalarse, así que tiene que ser estática y
 * no depender de nada: ni sesión, ni base de datos, ni fuentes remotas. Si
 * necesitara red para pintarse, no serviría justo cuando hace falta.
 *
 * Se explica qué se puede y qué no se puede hacer sin conexión en vez de un «sin
 * internet» a secas. Lo que el cliente quiere saber es si su código sigue ahí,
 * y la respuesta honesta es que no: los códigos llegan por la red.
 */
export default function SinConexionPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-canvas)] px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border-[3px] border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[6px_6px_0_var(--color-border)]">
        <WifiOff aria-hidden className="size-10" strokeWidth={2} />

        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-[0.9] tracking-[-0.04em]">
          Sin conexión
        </h1>

        <p className="text-sm leading-relaxed text-[var(--color-content-muted)]">
          No hay internet en este momento. Tus perfiles y tus códigos siguen guardados; en cuanto
          vuelva la señal aparecen solos.
        </p>

        <p className="text-xs text-[var(--color-content-subtle)]">
          Los códigos de verificación llegan por internet, así que hace falta conexión para verlos.
        </p>
      </div>
    </main>
  );
}
