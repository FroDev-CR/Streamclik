import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Clock3,
  KeyRound,
  LockKeyhole,
  Sparkles,
  Zap,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { formatPrice, getPublicCatalog } from "@/features/catalog/queries";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Elige tu cuenta o perfil de streaming y recíbelo automáticamente.",
};

export const dynamic = "force-dynamic";

/**
 * Las iniciales de la tarjeta salen del nombre y no de una tabla escrita a mano:
 * una plataforma creada desde el panel tiene que aparecer aquí completa, sin
 * pasar por el código.
 */
function iniciales(nombre: string): string {
  const limpio = nombre.replace(/\+/g, "");
  return nombre.includes("+")
    ? `${limpio.charAt(0).toUpperCase()}+`
    : limpio.charAt(0).toUpperCase();
}

const FEATURES = [
  "Perfil individual con PIN",
  "Códigos de verificación al instante",
  "Soporte cuando lo necesites",
] as const;

/**
 * Catálogo público.
 *
 * Los productos y su disponibilidad vienen de `catalogo_publico()`, no de una
 * lista en el código. Estaban escritos a mano y decían «Próximamente» para
 * Disney+ y Prime Video aunque hubiera cuentas cargadas en el banco: el
 * escaparate contradecía al inventario, y esa es la clase de detalle que se
 * paga en la primera compra fallida.
 */
export default async function CatalogPage() {
  const { userId } = await auth();
  const productos = await getPublicCatalog();

  // Sin sesión se pasa por Clerk y se vuelve a la compra del mismo producto: el
  // registro deja de ser un desvío y pasa a ser un paso dentro de la compra.
  const comprarHref = (slug: string) =>
    userId
      ? `/comprar/${slug}`
      : `/login?redirect_url=${encodeURIComponent(`/comprar/${slug}`)}`;

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <div className="catalog-shader sc-hero-grid-bg" aria-hidden />
        <div className="catalog-shader-wash" aria-hidden />

        <div className="landing-shell catalog-hero-inner">
          <header className="landing-nav catalog-nav">
            <Link
              href="/"
              aria-label="StreamClick, inicio"
              className="landing-logo-wrap"
            >
              <Logo className="landing-logo" priority />
            </Link>

            <nav
              className="landing-nav-links"
              aria-label="Navegación del catálogo"
            >
              <Link href="/" className="landing-nav-anchor catalog-home-link">
                <ArrowLeft aria-hidden /> Inicio
              </Link>
              {userId ? (
                <Link
                  href="/dashboard"
                  className="landing-button landing-button-dark landing-button-small"
                >
                  Mi cuenta <ArrowRight aria-hidden />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="landing-button landing-button-dark landing-button-small"
                >
                  Entrar <ArrowRight aria-hidden />
                </Link>
              )}
            </nav>
          </header>

          <div className="catalog-title-card">
            <p className="landing-eyebrow">
              <Sparkles aria-hidden /> Catálogo StreamClick
            </p>
            <h1>
              Elige qué quieres ver.
              <br />
              Nosotros lo dejamos listo.
            </h1>
            <p>
              Explora sin registrarte. Solo te pediremos iniciar sesión cuando
              decidas comprar un perfil.
            </p>
            <div className="catalog-hero-trust">
              <span>
                <BadgeCheck aria-hidden /> Cuentas originales
              </span>
              <span>
                <Zap aria-hidden /> Entrega automática
              </span>
              <span>
                <LockKeyhole aria-hidden /> Compra protegida
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="catalog-products"
        aria-labelledby="catalog-products-title"
      >
        <div className="landing-shell">
          <div className="catalog-section-header">
            <div>
              <p className="landing-section-label">Disponibilidad actual</p>
              <h2 id="catalog-products-title">Cuentas y perfiles</h2>
            </div>
            <p>
              Sin chats, sin comprobantes por mensaje y sin esperar una
              respuesta.
            </p>
          </div>

          {/* Sin productos la rejilla NO desaparece: se dice que están en
              camino. Ocultar la sección entera dejaba la página idéntica tanto
              si faltaba la migración como si no había stock, y no había forma
              de distinguirlo. */}
          {productos.length === 0 ? (
            <p className="catalog-product-description">
              Estamos preparando los perfiles disponibles. Escríbenos y te
              avisamos en cuanto abramos cupos.
            </p>
          ) : (
            <div className="catalog-grid">
              {productos.map((product, index) => {
                const disponible = product.disponibles > 0;

                return (
                  <article
                    key={product.slug}
                    className={`catalog-product-card ${disponible ? "catalog-product-active" : "catalog-product-soon"}`}
                  >
                    <div className="catalog-product-order">0{index + 1}</div>
                    <div
                      className="catalog-product-mark"
                      style={{ backgroundColor: product.color }}
                      aria-hidden
                    >
                      {iniciales(product.nombre)}
                    </div>

                    <div className="catalog-product-status">
                      {disponible ? (
                        <>
                          <span className="catalog-status-dot" />{" "}
                          {product.disponibles}{" "}
                          {product.disponibles === 1
                            ? "disponible"
                            : "disponibles"}
                        </>
                      ) : (
                        <>
                          <Clock3 aria-hidden /> Sin cupos ahora
                        </>
                      )}
                    </div>

                    <p className="catalog-product-eyebrow">
                      {formatPrice(product.precio, product.moneda)} / mes
                    </p>
                    <h3>{product.nombre}</h3>
                    <p className="catalog-product-description">
                      {product.lema ??
                        "Tu propio perfil, sin compartir tu cuenta con nadie."}
                    </p>

                    <ul>
                      {FEATURES.map((feature) => (
                        <li key={feature}>
                          <Check aria-hidden /> {feature}
                        </li>
                      ))}
                    </ul>

                    {disponible ? (
                      <Link
                        href={comprarHref(product.slug)}
                        className="catalog-buy-button"
                      >
                        Comprar perfil <ArrowRight aria-hidden />
                      </Link>
                    ) : (
                      <span className="catalog-buy-button catalog-buy-disabled">
                        Muy pronto
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="catalog-explainer">
            <div className="catalog-explainer-icon">
              <KeyRound aria-hidden />
            </div>
            <div>
              <p className="landing-section-label">Incluido con tu perfil</p>
              <h2>¿Te piden un código? Ya está en tu panel.</h2>
            </div>
            <p>
              StreamClick recibe la verificación y la muestra automáticamente
              mientras todavía es válida. No tienes que escribirle a nadie.
            </p>
          </div>
        </div>
      </section>

      <footer className="landing-footer catalog-footer">
        <div className="landing-shell landing-footer-inner">
          <div className="landing-footer-logo-wrap">
            <Logo className="landing-footer-logo" />
          </div>
          <p>Explora primero. Inicia sesión cuando quieras comprar.</p>
          <div className="landing-footer-links">
            <Link href="/">Inicio</Link>
            <Link href="/login">Entrar</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
