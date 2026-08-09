import { ClerkProvider } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';
import { Kanit } from 'next/font/google';
import { Toaster } from 'sonner';

import { PwaRegister } from '@/components/pwa-register';
import { WhatsappButton } from '@/components/whatsapp-button';

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
  metadataBase: new URL('https://streamclick.xyz'),
  title: {
    default: 'StreamClick',
    template: '%s · StreamClick',
  },
  description:
    'Elige tu plataforma, compra y recibe tu perfil automáticamente. Sin chats ni esperas.',
  // `manifest` lo sirve `src/app/manifest.ts` por convención de fichero.
  manifest: '/manifest.webmanifest',
  applicationName: 'StreamClick',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
    // iOS ignora los iconos del manifiesto: usa este y sólo este. Sin él, al
    // añadir a la pantalla de inicio Safari guarda una captura de la página.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  /**
   * Modo aplicación en iOS.
   *
   * Safari no muestra ningún aviso de instalación —hay que ir a Compartir y
   * «Añadir a pantalla de inicio»—, pero sí respeta estas etiquetas una vez
   * añadida. Sin ellas se abre con la barra de Safari encima y no se distingue
   * de un marcador.
   *
   * `statusBarStyle: 'default'` mantiene los iconos del sistema oscuros, que es
   * lo legible sobre el crema de la interfaz; con `black-translucent` el
   * contenido se mete debajo del reloj.
   */
  appleWebApp: {
    capable: true,
    title: 'StreamClick',
    statusBarStyle: 'default',
  },
  /**
   * La etiqueta antigua de iOS, a mano.
   *
   * Next 15 emite `mobile-web-app-capable`, que es el nombre estándar, pero iOS
   * sólo lo respeta desde la 17.4. En un iPhone anterior la aplicación añadida a
   * la pantalla de inicio se abriría con la barra de Safari encima —o sea, como
   * un marcador— y no habría forma de saber por qué.
   *
   * Las dos pueden convivir: un navegador que entiende la nueva ignora esta.
   */
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  // iOS intenta convertir en enlaces cualquier cosa que parezca un teléfono. Los
  // códigos de verificación de seis dígitos entran en esa categoría, y quedaban
  // subrayados en azul con un menú de llamada al tocarlos.
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'es_CR',
    url: '/',
    siteName: 'StreamClick',
    title: 'StreamClick · Todo automático',
    description: 'Netflix, Disney+, Max y Prime Video. Elige, paga y recibe automáticamente.',
    images: [
      {
        url: '/og.png',
        width: 840,
        height: 837,
        alt: 'StreamClick: todo automático. Elige, paga y recibe.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StreamClick · Todo automático',
    description: 'Elige, paga y recibe. Sin chats ni esperas.',
    images: ['/og.png'],
  },
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
        <body className="min-h-dvh">
          {children}
          <PwaRegister />
          <WhatsappButton />
          <Toaster position="top-right" offset={20} />
        </body>
      </html>
    </ClerkProvider>
  );
}
