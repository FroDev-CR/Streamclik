import Link from 'next/link';
import { Check, KeyRound, Zap } from 'lucide-react';

import { Logo } from '@/components/logo';

/**
 * Hero de la landing.
 *
 * Sustituye al fondo WebGL. El motivo no es estético: la página montaba el
 * shader **dos veces** —hero y sección final—, y cada instancia abre su propio
 * contexto WebGL con su propio bucle a 60 fps. Dos renders de GPU a pantalla
 * completa por fotograma, para un adorno. Aquí el fondo es una rejilla hecha con
 * dos degradados repetidos: cuesta cero, no tiene bucle y no puede ir a tirones.
 *
 * Las tarjetas flotan con `@keyframes` en vez de una librería de animación. Dos
 * bucles de translateY no justifican traerse un runtime entero, y con CSS puro
 * `prefers-reduced-motion` se respeta con una media query en lugar de con
 * lógica. Eso además mantiene este componente como Server Component: la landing
 * no envía JavaScript propio al navegador.
 *
 * Estructura tomada del ejemplo de 21st.dev (Base Club) y adaptada al negocio:
 * la tipografía escalonada, las tarjetas de cristal y el badge giratorio se
 * conservan; el contenido pasa de puntos y wallets a perfiles y códigos.
 */

const PALABRAS = ['TU', 'STREAMING', 'A UN CLICK'] as const;

function BadgeCircular() {
  return (
    <div className="sc-badge">
      <div className="sc-badge-spin">
        <svg viewBox="0 0 100 100" aria-hidden>
          <path
            id="sc-badge-path"
            d="M 50, 50 m -36, 0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0"
            fill="none"
          />
          <text>
            <textPath href="#sc-badge-path" startOffset="0%">
              EMPIEZA GRATIS • EMPIEZA GRATIS •&nbsp;
            </textPath>
          </text>
        </svg>
      </div>

      <svg className="sc-badge-arrow" viewBox="0 0 100 100" aria-hidden>
        <path d="M20,80 Q 40,50 30,30 T 80,20" />
        <path d="M60,10 L80,20 L70,40" />
      </svg>
    </div>
  );
}

export function Hero() {
  return (
    <section className="sc-hero">
      <div className="sc-hero-grid-bg" aria-hidden />

      <nav className="sc-hero-nav" aria-label="Navegación principal">
        <Link href="/" aria-label="StreamClick, inicio" className="sc-hero-logo-wrap">
          <Logo className="sc-hero-logo" priority />
        </Link>

        {/* El eslogan vive en la barra, no sólo en el titular: es lo primero que
            se lee y lo que queda cuando el titular sale de pantalla al hacer
            scroll. */}
        <p className="sc-hero-tagline">Tu entretenimiento a un click</p>

        <div className="sc-hero-nav-links">
          <Link href="#ventajas">Ventajas</Link>
          <Link href="#como-funciona">Cómo funciona</Link>
          <Link href="/login">Entrar</Link>
        </div>

        <Link href="/catalogo" className="sc-hero-nav-cta">
          Ver cuentas
        </Link>
      </nav>

      <div className="sc-hero-stage">
        <h1 className="sc-hero-title">
          {PALABRAS.map((palabra, i) => (
            <span key={palabra} className={`sc-hero-line sc-hero-line-${i + 1}`}>
              {palabra}
            </span>
          ))}
        </h1>

        {/* Capa decorativa. `pointer-events-none` en el contenedor y reactivado
            sólo en las tarjetas: si no, esta capa cubre el titular y los enlaces
            de debajo dejan de poder pulsarse. */}
        <div className="sc-hero-overlays" aria-hidden>
          <div className="sc-float-card sc-float-card-1">
            <div className="sc-float-card-inner">
              <span className="sc-float-avatar">
                <KeyRound aria-hidden />
              </span>
              <p className="sc-float-name">Código recibido</p>
              <p className="sc-float-code">4821</p>
              <p className="sc-float-meta">hace 2 segundos</p>
            </div>
          </div>

          <div className="sc-float-card sc-float-card-2">
            <div className="sc-float-card-inner">
              <span className="sc-float-avatar sc-float-avatar-amber">
                <Zap aria-hidden />
              </span>
              <p className="sc-float-name">Perfil 03</p>
              <p className="sc-float-code sc-float-code-small">Activo</p>
              <p className="sc-float-meta">entrega automática</p>
            </div>
          </div>

          <svg className="sc-arrow sc-arrow-left" viewBox="0 0 100 100" aria-hidden>
            <path d="M10,90 C 10,40 40,20 60,50 C 70,65 80,75 95,70" />
            <path d="M80,55 L95,70 L85,85" />
          </svg>

          <svg className="sc-arrow sc-arrow-right" viewBox="0 0 100 100" aria-hidden>
            <path d="M90,10 C 80,60 60,80 40,60 C 20,40 40,20 60,30 C 80,40 70,70 50,80" />
            <path d="M65,75 L50,80 L55,65" />
          </svg>

          <Link href="/registro" className="sc-badge-wrap" tabIndex={-1} aria-hidden>
            <BadgeCircular />
          </Link>
        </div>
      </div>

      <div className="sc-hero-foot">
        <p className="sc-hero-description">
          Compramos las cuentas, recibimos sus correos y te entregamos el perfil al instante. Cuando
          el servicio pide un código de verificación, aparece en tu panel en tiempo real.
        </p>

        <div className="sc-hero-actions">
          <Link href="/catalogo" className="sc-btn sc-btn-amber">
            Quiero mi perfil
          </Link>
          <Link href="/login" className="sc-btn sc-btn-ghost">
            Ya tengo cuenta
          </Link>
        </div>

        <ul className="sc-hero-proof">
          <li>
            <Check aria-hidden /> Cuentas originales
          </li>
          <li>
            <Check aria-hidden /> Acceso inmediato
          </li>
          <li>
            <Check aria-hidden /> Sistema 24/7
          </li>
        </ul>
      </div>
    </section>
  );
}
