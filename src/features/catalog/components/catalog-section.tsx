import { Check } from 'lucide-react';

import { PlatformIcon } from '@/components/platform-icon';
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button';

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
  // Sin datos la sección NO desaparece: se muestra con un estado de espera.
  //
  // Ocultarla entera fue un error. Si la función `catalogo_publico()` todavía no
  // está creada en la base de datos, la portada quedaba exactamente igual que
  // antes y no había forma de saber si el problema era la migración, el
  // despliegue o el sitio donde se insertó la sección. Es el mismo fallo
  // silencioso que ya costó un ciclo de depuración en el panel de administración.
  if (items.length === 0) {
    return (
      <section className="catalogo-section" id="catalogo">
        <div className="landing-shell">
          <header className="catalogo-header">
            <p className="landing-section-label">02 / Catálogo</p>
            <h2>Muy pronto</h2>
            <p className="catalogo-intro">
              Estamos preparando los perfiles disponibles. Escríbenos y te avisamos en cuanto
              abramos cupos.
            </p>
          </header>
        </div>
      </section>
    );
  }

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
                  <span className="catalogo-mark">
                    <PlatformIcon
                      iconKey={item.icono}
                      name={item.nombre}
                      className="catalogo-platform-icon"
                    />
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
                  <AddToCartButton
                    productType="service"
                    slug={item.slug}
                    label="Agregar al carrito"
                    className="catalogo-cta"
                  />
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
