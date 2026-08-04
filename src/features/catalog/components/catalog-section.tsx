import { Check, Clock3, Layers3 } from 'lucide-react';

import { PlatformIcon } from '@/components/platform-icon';
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button';

import { formatPrice, type CatalogCombo, type CatalogItem } from '../queries';

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
export function CatalogSection({
  items,
  combos,
}: {
  items: CatalogItem[];
  combos: CatalogCombo[];
}) {
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

        <div className="catalogo-combos" id="combos">
          <header className="catalogo-combos-header">
            <p className="landing-section-label">03 / Ahorra con el paquete</p>
            <h3>¡Combos!</h3>
            <p className="catalogo-intro">
              Varias aplicaciones o varios perfiles de tu app favorita, reunidos en una sola
              compra y con un mejor precio mensual.
            </p>
          </header>

          {combos.length === 0 ? (
            <div className="catalog-combo-empty">
              <Layers3 aria-hidden />
              <p>Estamos preparando los primeros combos. Muy pronto aparecerán aquí.</p>
            </div>
          ) : (
            <div className="catalog-combo-grid">
              {combos.map((combo) => {
                const disponible = combo.disponibles > 0;

                return (
                  <article key={combo.slug} className="catalog-combo-card">
                    <div className="catalog-combo-badge">
                      <Layers3 aria-hidden /> Precio paquete
                    </div>

                    <div className="catalog-combo-apps" aria-label="Perfiles incluidos">
                      {combo.servicios.map((servicio) => (
                        <span key={servicio.slug}>
                          <PlatformIcon iconKey={servicio.icono} name={servicio.nombre} />
                          {servicio.nombre}
                          {servicio.cantidad > 1 && ` ×${servicio.cantidad}`}
                        </span>
                      ))}
                    </div>

                    <h4>{combo.nombre}</h4>
                    <p className="catalog-product-description">
                      {combo.lema ?? 'Más contenido, menos gasto y todo listo en tu panel.'}
                    </p>

                    <div className="catalog-combo-price">
                      <strong>{formatPrice(combo.precio, combo.moneda)}</strong>
                      <span>/ mes</span>
                    </div>

                    <p className="catalog-product-status">
                      {disponible ? (
                        <>
                          <span className="catalog-status-dot" /> {combo.disponibles}{' '}
                          {combo.disponibles === 1 ? 'combo disponible' : 'combos disponibles'}
                        </>
                      ) : (
                        <>
                          <Clock3 aria-hidden /> Sin cupos ahora
                        </>
                      )}
                    </p>

                    {disponible ? (
                      <AddToCartButton
                        productType="combo"
                        slug={combo.slug}
                        label="Agregar combo al carrito"
                      />
                    ) : (
                      <span className="catalog-buy-button catalog-buy-disabled">Muy pronto</span>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <p className="catalogo-nota">
          Los perfiles y combos se actualizan solos. Si algo aparece sin cupos, escríbenos y te
          avisamos en cuanto vuelva a estar disponible.
        </p>
      </div>
    </section>
  );
}
