import { ClerkProvider } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';

import { clerkAppearance } from '@/features/auth/clerk-appearance';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'StreamClick',
    template: '%s · StreamClick',
  },
  description: 'Gestiona tus cuentas de streaming compartidas y recibe los códigos al instante.',
  // La aplicación maneja credenciales de terceros: no debe aparecer en buscadores.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#08090c',
  width: 'device-width',
  initialScale: 1,
};

/**
 * `esES` traduce los formularios de Clerk. Sin ella el resto de la aplicación
 * está en español y el login aparece en inglés, que es donde el usuario escribe
 * su contraseña y menos conviene desconcertarlo.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={esES} appearance={clerkAppearance}>
      <html lang="es" suppressHydrationWarning>
        <body className="min-h-dvh">{children}</body>
      </html>
    </ClerkProvider>
  );
}
