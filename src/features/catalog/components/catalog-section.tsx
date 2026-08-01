import Link from 'next/link';
import { Check, Zap } from 'lucide-react';

import { formatPrice, type CatalogItem } from '../queries';

/**
 * Escaparate de la portada: qué se vende, a cuánto y cuánto queda.
 *
 * Va justo debajo del hero porque es lo que responde a la pregunta con la que
 * llega el visitante —«¿qué me ofrecen y cuánto cuesta?»—, antes que cualquier
 * argumento de venta.
 *
 * La disponibilidad es real, no un adorno: sale de contar perfiles sin
 * asignación vigente. Mostrar «quedan 3» cuando de verdad quedan 3 es lo que
 * hace creíble el resto de la página; inventarlo se nota a la primera compra.
 */
export function CatalogSection({ items }: { items: CatalogItem[] }) {
  // Sin catálogo la sección desaparece entera en lugar de dejar un hueco con un
  // titular y nada debajo.
  if (items.length === 0) return null;

  return (
    <section className="catalogo-section" id="catalogo">
      <div className="landing-shell">
        <header className="catalogo-header">
          <p className="landing-section-label">02 / Catálogo</p>
          <h2>Elige tu perfil</h2>
          <p className="catalogo-intro">
            Un perfil propio dentro de una cuenta compartida. Con tu PIN, tus recomendaciones y tus
            códigos de verificación al instante.
          </p>
        </header>

        <ul className="catalogo-grid">
          {items.map((item) => {
            const agotado = item.disponibles === 0;

            return (
              <li
                key={item.slug}
                className={`catalogo-card${agotado ? ' catalogo-card-agotado' : ''}`}
              >
                <div className="catalogo-card-top">
                  <span className="catalogo-mark" style={{ backgroundColor: item.color }}>
                    {item.nombre.charAt(0)}
                  </span>

                  <span className={`catalogo-stock${agotado ? ' catalogo-stock-agotado' : ''}`}>
                    {agotado ? (
                      'Sin cupos'
                    ) : (
                      <>
                        <i className="catalogo-stock-dot" aria-hidden />
                        {item.disponibles} {item.disponibles === 1 ? 'disponible' : 'disponibles'}
                      </>
                    )}
                  </span>
                </div>

                <h3>{item.nombre}</h3>

                <p className="catalogo-lema">
                  {item.lema ?? 'Tu propio perfil, sin compartir tu cuenta con nadie.'}
                </p>

                <ul className="catalogo-features">
                  <li>
                    <Check aria-hidden /> Perfil individual con PIN
                  </li>
                  <li>
                    <Check aria-hidden /> Códigos automáticos al instante
                  </li>
                  <li>
                    <Check aria-hidden /> Soporte cuando lo necesites
                  </li>
                </ul>

                <div className="catalogo-precio">
                  <span className="catalogo-precio-monto">
                    {formatPrice(item.precio, item.moneda)}
                  </span>
                  <span className="catalogo-precio-periodo">/ mes</span>
                </div>

                {agotado ? (
                  <span className="catalogo-cta catalogo-cta-disabled" aria-disabled="true">
                    Sin cupos ahora
                  </span>
                ) : (
                  <Link href="/registro" className="catalogo-cta">
                    <Zap aria-hidden /> Lo quiero
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <p className="catalogo-nota">
          Los cupos se actualizan solos. Si tu servicio aparece sin cupos, escríbenos y te avisamos
          en cuanto se libere uno.
        </p>
      </div>
    </section>
  );
}
