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
import { ShaderBackground } from "@/components/shader-background";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Elige tu cuenta o perfil de streaming y recíbelo automáticamente.",
};

export const dynamic = "force-dynamic";

const PRODUCTS = [
  {
    slug: "netflix",
    name: "Netflix",
    eyebrow: "Series, películas y más",
    description:
      "Tu perfil listo para entrar, con los códigos de verificación siempre en tu panel.",
    color: "#e50914",
    initials: "N",
    available: true,
    features: [
      "Perfil individual",
      "Entrega automática",
      "Códigos al instante",
    ],
  },
  {
    slug: "disney-plus",
    name: "Disney+",
    eyebrow: "Historias para todos",
    description:
      "Estamos preparando una experiencia tan automática y estable como la de Netflix.",
    color: "#113ccf",
    initials: "D+",
    available: false,
    features: ["Perfil individual", "Cuenta original", "Acceso protegido"],
  },
  {
    slug: "prime-video",
    name: "Prime Video",
    eyebrow: "Entretenimiento sin límites",
    description:
      "Muy pronto podrás recibir también este acceso directamente desde StreamClick.",
    color: "#00a8e1",
    initials: "P",
    available: false,
    features: ["Perfil individual", "Cuenta original", "Acceso protegido"],
  },
] as const;

export default async function CatalogPage() {
  const { userId } = await auth();
  const purchaseHref = userId
    ? "/dashboard"
    : `/login?redirect_url=${encodeURIComponent("/dashboard")}`;

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <ShaderBackground className="catalog-shader" />
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

          <div className="catalog-grid">
            {PRODUCTS.map((product, index) => (
              <article
                key={product.slug}
                className={`catalog-product-card ${product.available ? "catalog-product-active" : "catalog-product-soon"}`}
              >
                <div className="catalog-product-order">0{index + 1}</div>
                <div
                  className="catalog-product-mark"
                  style={{ backgroundColor: product.color }}
                  aria-hidden
                >
                  {product.initials}
                </div>

                <div className="catalog-product-status">
                  {product.available ? (
                    <>
                      <span className="catalog-status-dot" /> Disponible ahora
                    </>
                  ) : (
                    <>
                      <Clock3 aria-hidden /> Próximamente
                    </>
                  )}
                </div>

                <p className="catalog-product-eyebrow">{product.eyebrow}</p>
                <h3>{product.name}</h3>
                <p className="catalog-product-description">
                  {product.description}
                </p>

                <ul>
                  {product.features.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden /> {feature}
                    </li>
                  ))}
                </ul>

                {product.available ? (
                  <Link href={purchaseHref} className="catalog-buy-button">
                    Comprar perfil <ArrowRight aria-hidden />
                  </Link>
                ) : (
                  <span className="catalog-buy-button catalog-buy-disabled">
                    Muy pronto
                  </span>
                )}
              </article>
            ))}
          </div>

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
