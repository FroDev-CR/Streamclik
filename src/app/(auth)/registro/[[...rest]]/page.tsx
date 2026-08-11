import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

import { clerkAppearance } from "@/features/auth/clerk-appearance";

export const metadata: Metadata = { title: "Crear cuenta" };

type RegisterPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

/**
 * Destino tras el alta.
 *
 * Por defecto `/bienvenida`, que es donde se pide el WhatsApp. Antes se mandaba
 * a `/dashboard` y se confiaba en que éste rebotara a `/bienvenida` al ver el
 * perfil sin teléfono: un rebote de más, justo en el momento más frágil del
 * flujo —el perfil se está creando en esa misma petición—, y el paso se perdía
 * si algo iba mal por el camino. Se va directo al sitio.
 *
 * Un `redirect_url` explícito (por ejemplo, quien venía de comprar) sigue
 * mandando: `/bienvenida` se sale sola cuando ya no hace falta.
 */
function safeRedirect(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : null;
}

export default async function RegistroPage({
  searchParams,
}: RegisterPageProps) {
  const pedido = safeRedirect((await searchParams).redirect_url);
  const redirectTo = pedido ?? "/bienvenida";

  // El enlace a «ya tengo cuenta» sólo arrastra el destino si lo pidieron: quien
  // ya está registrado no tiene nada que hacer en `/bienvenida`.
  const signInUrl = pedido
    ? `/login?redirect_url=${encodeURIComponent(pedido)}`
    : "/login";

  return (
    <div className="auth-form-content">
      <div className="auth-form-heading">
        <p>Empieza en un minuto</p>
        <h1>Crea tu cuenta.</h1>
        <span>
          Tu perfil, tus accesos y tus códigos siempre en un solo lugar.
        </span>
      </div>

      <SignUp
        appearance={clerkAppearance}
        signInUrl={signInUrl}
        forceRedirectUrl={redirectTo}
        fallbackRedirectUrl={redirectTo}
      />
    </div>
  );
}
