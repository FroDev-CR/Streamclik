import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Globe, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireAdmin } from '@/features/auth/session';
import { getResumenVisitas } from '@/features/analytics/queries';

export const metadata: Metadata = { title: 'Visitas' };

/** Nombre del país a partir de su código, con la bandera. */
function pais(codigo: string): string {
  if (codigo === '??') return 'Desconocido';

  try {
    const nombre = new Intl.DisplayNames(['es'], { type: 'region' }).of(codigo);
    // Las banderas se componen con los dos caracteres regionales del código.
    const bandera = String.fromCodePoint(
      ...[...codigo.toUpperCase()].map((letra) => 0x1f1e6 + letra.charCodeAt(0) - 65),
    );
    return `${bandera} ${nombre ?? codigo}`;
  } catch {
    return codigo;
  }
}

function Barra({ etiqueta, total, maximo }: { etiqueta: string; total: number; maximo: number }) {
  const porcentaje = maximo > 0 ? Math.round((total / maximo) * 100) : 0;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold">{etiqueta}</span>
        <span className="shrink-0 font-mono text-xs text-[var(--color-content-muted)]">{total}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-canvas)]">
        <div
          className="h-full bg-[var(--color-accent)]"
          style={{ width: `${porcentaje}%` }}
          aria-hidden
        />
      </div>
    </li>
  );
}

/**
 * Visitas de la web.
 *
 * La cifra que importa no es cuánta gente entró sino cuánta se quedó: por eso
 * la conversión va arriba y del mismo tamaño que el resto. Un pico de visitas
 * sin registros es un problema de la página, no un éxito de marketing.
 */
export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireAdmin();

  const { dias } = await searchParams;
  const ventana = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;

  const { data, error } = await getResumenVisitas(ventana);

  const conversion =
    data.sesiones > 0 ? ((data.registros / data.sesiones) * 100).toFixed(1) : '0.0';

  const maxPais = Math.max(...data.paises.map((p) => p.total), 1);
  const maxPagina = Math.max(...data.paginas.map((p) => p.total), 1);
  const maxOrigen = Math.max(...data.origenes.map((o) => o.total), 1);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <TrendingUp aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Visitas
        </h1>

        <div className="mt-5 flex flex-wrap gap-2">
          {[7, 30, 90].map((opcion) => (
            <Link key={opcion} href={`/admin/visitas?dias=${opcion}`}>
              <Badge tone={opcion === ventana ? 'accent' : 'neutral'}>{opcion} días</Badge>
            </Link>
          ))}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar las visitas
          </p>
          <p className="mt-2 font-mono text-xs">{error}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { titulo: 'Personas', valor: data.sesiones, pie: 'sesiones distintas' },
          { titulo: 'Páginas vistas', valor: data.visitas, pie: 'en total' },
          {
            titulo: 'Se registraron',
            valor: data.registros,
            pie: `${conversion} % de los que entraron`,
          },
        ].map(({ titulo, valor, pie }) => (
          <Card key={titulo}>
            <CardContent>
              <p className="font-[family-name:var(--font-display)] text-[0.7rem] font-extrabold uppercase tracking-wider text-[var(--color-content-muted)]">
                {titulo}
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-black leading-none">
                {valor}
              </p>
              <p className="mt-1.5 text-xs text-[var(--color-content-muted)]">{pie}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.visitas === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Globe aria-hidden className="size-7" strokeWidth={2} />
            <p className="font-[family-name:var(--font-display)] text-base font-black uppercase">
              Todavía no hay visitas registradas
            </p>
            <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
              El contador empieza a contar desde que se despliega. Si acabas de activarlo, dale unas
              horas.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-wider">
              De dónde entran
            </h2>
            {data.paises.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-content-muted)]">Sin datos todavía.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {data.paises.map((fila) => (
                  <Barra
                    key={fila.country}
                    etiqueta={pais(fila.country)}
                    total={fila.total}
                    maximo={maxPais}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-wider">
              Páginas más vistas
            </h2>
            {data.paginas.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-content-muted)]">Sin datos todavía.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {data.paginas.map((fila) => (
                  <Barra
                    key={fila.path}
                    etiqueta={fila.path}
                    total={fila.total}
                    maximo={maxPagina}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <h2 className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-wider">
            Cómo te encontraron
          </h2>
          {data.origenes.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-content-muted)]">
              Nadie llegó desde otro sitio todavía. Cuando compartas el enlace en Instagram o
              WhatsApp, aparecerá aquí de dónde vienen.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {data.origenes.map((fila) => (
                <Barra
                  key={fila.referrer}
                  etiqueta={fila.referrer}
                  total={fila.total}
                  maximo={maxOrigen}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-content-muted)]">
        Este contador no guarda direcciones IP ni identifica a nadie. Para el detalle por página y
        dispositivo, Vercel tiene su propio panel.
        <a
          href="https://vercel.com/frodev-crs-projects/streamclik/analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
        >
          Abrir Vercel Analytics
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </p>
    </div>
  );
}
