import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Clock3,
  CreditCard,
  KeyRound,
  MessageCircleOff,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Zap,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { ShaderBackground } from "@/components/shader-background";

const BENEFITS = [
  {
    icon: BadgeCheck,
    kicker: "Cero reventa",
    title: "Cuentas propias y originales.",
    body: "Trabajamos con cuentas contratadas directamente. Tu perfil no depende de una cadena de revendedores.",
    tone: "yellow",
  },
  {
    icon: MessageCircleOff,
    kicker: "Cero chats",
    title: "Todo sucede en tu panel.",
    body: "Credenciales, perfil y códigos en un solo lugar. No tienes que escribirle a nadie para poder entrar.",
    tone: "cream",
  },
  {
    icon: Zap,
    kicker: "Cero esperas",
    title: "Entrega automática, 24/7.",
    body: "El sistema procesa tu compra y te entrega el acceso en el momento, incluso si es de madrugada.",
    tone: "blue",
  },
  {
    icon: ShieldCheck,
    kicker: "Cero vueltas",
    title: "Accesos estables y protegidos.",
    body: "Cada usuario ve únicamente su perfil y sus códigos. Simple para ti, seguro por detrás.",
    tone: "dark",
  },
] as const;

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Elige tu servicio",
    body: "Selecciona la plataforma y el perfil que quieres usar.",
  },
  {
    icon: CreditCard,
    title: "Completa tu compra",
    body: "Paga en pocos pasos, sin conversaciones ni coordinaciones manuales.",
  },
  {
    icon: UserRoundCheck,
    title: "Empieza a mirar",
    body: "Recibe el acceso en tu panel y disfruta al instante.",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <ShaderBackground className="landing-shader" />
        <div className="landing-hero-wash" aria-hidden />

        <div className="landing-shell landing-hero-shell">
          <header className="landing-nav">
            <Link
              href="/"
              aria-label="StreamClick, inicio"
              className="landing-logo-wrap"
            >
              <Logo className="landing-logo" priority />
            </Link>

            <nav
              className="landing-nav-links"
              aria-label="Navegación principal"
            >
              <Link href="#ventajas" className="landing-nav-anchor">
                Ventajas
              </Link>
              <Link href="/login" className="landing-nav-anchor">
                Entrar
              </Link>
              <Link
                href="/catalogo"
                className="landing-button landing-button-dark landing-button-small"
              >
                Ver cuentas
                <ArrowRight aria-hidden />
              </Link>
            </nav>
          </header>

          <div className="landing-hero-grid">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">
                <Sparkles aria-hidden />
                Perfiles originales. Entrega inmediata.
              </p>

              <h1>
                Tu streaming.
                <br />
                Más barato.
                <br />
                Sin esperas.
              </h1>

              <p className="landing-hero-description">
                Compra cuentas y perfiles propios con un sistema realmente
                automático. Sin chats, sin caídas y sin esperar a que alguien te
                responda.
              </p>

              <div className="landing-hero-actions">
                <Link
                  href="/catalogo"
                  className="landing-button landing-button-yellow"
                >
                  Quiero mi perfil
                  <ArrowRight aria-hidden />
                </Link>
                <Link href="#como-funciona" className="landing-text-link">
                  Cómo funciona
                </Link>
              </div>

              <div
                className="landing-proof-row"
                aria-label="Beneficios principales"
              >
                <span>
                  <Check aria-hidden /> Cuentas originales
                </span>
                <span>
                  <Check aria-hidden /> Acceso inmediato
                </span>
                <span>
                  <Check aria-hidden /> Sistema 24/7
                </span>
              </div>
            </div>

            <aside
              className="landing-delivery-card"
              aria-label="Ejemplo de entrega automática"
            >
              <div className="landing-delivery-topbar">
                <span className="landing-live-dot" />
                <span>Sistema activo</span>
                <span className="landing-delivery-time">Ahora</span>
              </div>

              <div className="landing-delivery-heading">
                <div className="landing-delivery-icon">
                  <Zap aria-hidden />
                </div>
                <div>
                  <p>Compra aprobada</p>
                  <h2>Todo listo.</h2>
                </div>
              </div>

              <div className="landing-access-card">
                <div className="landing-access-title">
                  <span>Tu acceso</span>
                  <span className="landing-ready-pill">Entregado</span>
                </div>
                <dl>
                  <div>
                    <dt>Usuario</dt>
                    <dd>cliente@streamclick.app</dd>
                  </div>
                  <div>
                    <dt>Perfil</dt>
                    <dd>Perfil 03</dd>
                  </div>
                </dl>
              </div>

              <div className="landing-pin-card">
                <div>
                  <span className="landing-pin-label">
                    <KeyRound aria-hidden /> Código de acceso
                  </span>
                  <strong>482 991</strong>
                </div>
                <span className="landing-refresh-pill">
                  <Clock3 aria-hidden /> Actualizado
                </span>
              </div>

              <p className="landing-delivery-note">
                <ShieldCheck aria-hidden /> Entrega protegida y automática
              </p>
            </aside>
          </div>
        </div>

        <div className="landing-manifesto" aria-label="Nuestra promesa">
          <span>Sin chats</span>
          <i aria-hidden />
          <span>Sin caídas</span>
          <i aria-hidden />
          <span>Sin esperas</span>
          <i aria-hidden />
          <span>Solo dale play</span>
        </div>
      </section>

      <section className="landing-value-section" id="ventajas">
        <div className="landing-shell landing-value-grid">
          <div className="landing-value-copy">
            <p className="landing-section-label">01 / Paga menos</p>
            <h2>¿Pagar de más? Eso ya fue.</h2>
            <p>
              No necesitas pagar una suscripción completa para ver lo que te
              gusta. Compra solo el perfil que vas a usar y deja el resto con
              nosotros.
            </p>

            <ul className="landing-check-list">
              <li>
                <Check aria-hidden /> Menor costo que una cuenta completa
              </li>
              <li>
                <Check aria-hidden /> Sin contratos ni procesos complicados
              </li>
              <li>
                <Check aria-hidden /> Tu entretenimiento, sin pagar de más
              </li>
            </ul>

            <Link href="/catalogo" className="landing-inline-link">
              Ver cuentas disponibles <ArrowRight aria-hidden />
            </Link>
          </div>

          <div
            className="landing-price-comparison"
            aria-label="Comparación de costos"
          >
            <div className="landing-price-card landing-price-card-muted">
              <span>Suscripción completa</span>
              <strong>$$$</strong>
              <p>Pagas por todos los perfiles, aunque uses uno.</p>
            </div>

            <div className="landing-versus" aria-hidden>
              VS
            </div>

            <div className="landing-price-card landing-price-card-featured">
              <span>Tu perfil en StreamClick</span>
              <strong>$</strong>
              <p>Pagas únicamente por lo que vas a disfrutar.</p>
              <div className="landing-best-choice">
                <CircleDollarSign aria-hidden /> La opción inteligente
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-benefits-section">
        <div className="landing-shell">
          <div className="landing-section-heading landing-section-heading-light">
            <p className="landing-section-label">
              02 / Nosotros nos encargamos
            </p>
            <h2>
              Tú eliges qué ver.
              <br />
              Nosotros hacemos el resto.
            </h2>
          </div>

          <div className="landing-benefit-grid">
            {BENEFITS.map(({ icon: Icon, kicker, title, body, tone }) => (
              <article
                key={title}
                className={`landing-benefit-card landing-benefit-${tone}`}
              >
                <div className="landing-benefit-icon">
                  <Icon aria-hidden />
                </div>
                <p className="landing-benefit-kicker">{kicker}</p>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-process-section" id="como-funciona">
        <div className="landing-shell">
          <div className="landing-process-header">
            <div>
              <p className="landing-section-label">03 / Así de fácil</p>
              <h2>Tres pasos. Cero vueltas.</h2>
            </div>
            <p>
              Olvídate de preguntar disponibilidad, enviar comprobantes por chat
              o perseguir códigos. El sistema trabaja por ti.
            </p>
          </div>

          <ol className="landing-steps">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title}>
                <div className="landing-step-number">0{index + 1}</div>
                <Icon aria-hidden className="landing-step-icon" />
                <h3>{title}</h3>
                <p>{body}</p>
                {index < STEPS.length - 1 ? (
                  <ArrowRight aria-hidden className="landing-step-arrow" />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="landing-final-cta">
        <ShaderBackground className="landing-final-shader" />
        <div className="landing-final-wash" aria-hidden />
        <div className="landing-shell landing-final-content">
          <p className="landing-section-label">Tu próxima serie no espera</p>
          <h2>
            Dale play.
            <br />
            Nosotros hacemos el resto.
          </h2>
          <p>Tu perfil listo, tu código a mano y ningún chat de por medio.</p>
          <Link href="/catalogo" className="landing-button landing-button-dark">
            Ver cuentas disponibles
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-inner">
          <div className="landing-footer-logo-wrap">
            <Logo className="landing-footer-logo" />
          </div>
          <p>Cuentas y perfiles de streaming, sin complicaciones.</p>
          <div className="landing-footer-links">
            <Link href="/login">Entrar</Link>
            <Link href="/catalogo">Ver catálogo</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
