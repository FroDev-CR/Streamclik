import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

import { clerkAppearance } from "@/features/auth/clerk-appearance";

export const metadata: Metadata = { title: "Crear cuenta" };

type RegisterPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

function safeRedirect(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/dashboard";
}

export default async function RegistroPage({
  searchParams,
}: RegisterPageProps) {
  const redirectTo = safeRedirect((await searchParams).redirect_url);
  const signInUrl = `/login?redirect_url=${encodeURIComponent(redirectTo)}`;

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
