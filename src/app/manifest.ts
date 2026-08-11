import type { MetadataRoute } from 'next';

/**
 * Manifiesto de la aplicación instalable.
 *
 * Convención de fichero de Next: esto se sirve como `/manifest.webmanifest` y el
 * `<link rel="manifest">` lo inyecta el framework. Escribirlo en TypeScript y no
 * como JSON suelto es lo que hace que un campo mal escrito sea un error de
 * compilación en vez de un manifiesto que el navegador ignora en silencio.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'StreamClick',
    // Lo que cabe debajo del icono en la pantalla de inicio. Con el nombre largo
    // Android lo recorta a «StreamCli…».
    short_name: 'StreamClick',
    description: 'Tus perfiles de streaming y sus códigos de verificación, siempre a mano.',

    start_url: '/dashboard',
    scope: '/',

    // `standalone` quita la barra de direcciones: es lo que hace que parezca una
    // aplicación y no una pestaña guardada.
    display: 'standalone',
    orientation: 'portrait',

    lang: 'es-CR',
    dir: 'ltr',
    categories: ['entertainment', 'utilities'],

    // Deben coincidir con `--color-canvas` y con el `themeColor` del layout. Es
    // el color que Android pinta mientras arranca la aplicación; si no coincide,
    // se ve un destello de otro color en cada apertura.
    background_color: '#f4f1e8',
    theme_color: '#f4f1e8',

    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Sin un icono `maskable`, Android mete el icono cuadrado dentro de una
      // pastilla blanca y el resultado desentona con el resto de la pantalla.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],

    // Accesos directos del menú largo sobre el icono. Sólo los dos destinos que
    // se usan a diario; una lista más larga no cabe en la mayoría de lanzadores.
    shortcuts: [
      {
        name: 'Mis suscripciones',
        short_name: 'Suscripciones',
        url: '/dashboard',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Comprar más',
        short_name: 'Comprar',
        url: '/catalogo',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
