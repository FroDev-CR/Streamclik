import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import { clerkAppearance } from "@/features/auth/clerk-appearance";

export const metadata: Metadata = { title: "Entrar" };

type LoginPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

function safeRedirect(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/dashboard";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = safeRedirect((await searchParams).redirect_url);
  const signUpUrl = `/registro?redirect_url=${encodeURIComponent(redirectTo)}`;

  return (
    <div className="auth-form-content">
      <div className="auth-form-heading">
        <p>Tu cuenta StreamClick</p>
        <h1>Qué bueno verte.</h1>
        <span>Entra para gestionar tus perfiles y ver tus códigos.</span>
      </div>

      <SignIn
        appearance={clerkAppearance}
        signUpUrl={signUpUrl}
        forceRedirectUrl={redirectTo}
        fallbackRedirectUrl={redirectTo}
      />
    </div>
  );
}
