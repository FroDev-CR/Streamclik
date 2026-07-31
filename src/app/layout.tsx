import type { Metadata, Viewport } from 'next';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
