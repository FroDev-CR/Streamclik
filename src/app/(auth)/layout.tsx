import Link from "next/link";
import { ArrowLeft, BadgeCheck, KeyRound, Zap } from "lucide-react";

import { Logo } from "@/components/logo";
import { ShaderBackground } from "@/components/shader-background";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <ShaderBackground className="auth-shader" />
      <div className="auth-background-wash" aria-hidden />

      <div className="auth-shell">
        <header className="auth-topbar">
          <Link
            href="/"
            aria-label="StreamClick, inicio"
            className="auth-logo-wrap"
          >
            <Logo className="auth-logo" priority />
          </Link>
          <Link href="/catalogo" className="auth-back-link">
            <ArrowLeft aria-hidden /> Volver al catálogo
          </Link>
        </header>

        <div className="auth-frame">
          <aside className="auth-story">
            <p className="auth-story-label">
              Tu entretenimiento, sin complicaciones
            </p>
            <h2>
              Entra.
              <br />
              Elige.
              <br />
              Dale play.
            </h2>
            <p className="auth-story-copy">
              Todo lo que necesitas para disfrutar tu perfil vive en un solo
              lugar.
            </p>

            <div className="auth-story-benefits">
              <div>
                <Zap aria-hidden />
                <span>
                  <strong>Entrega automática</strong>
                  Tu acceso llega sin esperas.
                </span>
              </div>
              <div>
                <KeyRound aria-hidden />
                <span>
                  <strong>Códigos al instante</strong>
                  Siempre visibles en tu panel.
                </span>
              </div>
              <div>
                <BadgeCheck aria-hidden />
                <span>
                  <strong>Cuentas originales</strong>
                  Accesos estables y protegidos.
                </span>
              </div>
            </div>
          </aside>

          <section className="auth-form-panel">{children}</section>
        </div>

        <p className="auth-bottom-note">
          Acceso seguro · Tu información siempre protegida
        </p>
      </div>
    </main>
  );
}
