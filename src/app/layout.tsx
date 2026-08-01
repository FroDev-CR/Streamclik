import { ClerkProvider } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';
import { Kanit } from 'next/font/google';

import { clerkAppearance } from '@/features/auth/clerk-appearance';

import './globals.css';

/**
 * Kanit para los titulares: geométrica, algo condensada y con itálica real, que
 * es lo que hace juego con el logotipo.
 *
 * Sólo se cargan los cuatro cortes que se usan. Cada peso son ~30 KB, y una
 * familia completa costaría más que el resto del JavaScript de la landing.
 *
 * `display: 'swap'` muestra el texto con la fuente del sistema mientras Kanit
 * descarga. La alternativa es un titular invisible durante ese tiempo, justo en
 * la primera pintura.
 */
const kanit = Kanit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-kanit',
  display: 'swap',
});

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
  // Debe seguir a `--color-canvas`: tiñe la barra del navegador en móvil, y con
  // el valor oscuro anterior quedaba un marco negro alrededor de una interfaz
  // crema.
  themeColor: '#f4f1e8',
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
      <html lang="es" className={kanit.variable} suppressHydrationWarning>
        <body className="min-h-dvh">{children}</body>
      </html>
    </ClerkProvider>
  );
}
