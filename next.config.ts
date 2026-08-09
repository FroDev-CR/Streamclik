import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Los errores de tipo y de lint rompen el build a propósito. Desactivarlos
  // "temporalmente" para desplegar es cómo un proyecto acaba sin comprobación de
  // tipos real: nadie vuelve a activarlos.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // Cabeceras de seguridad. No sustituyen a RLS (docs/adr/0003), pero reducen la
  // superficie de ataque del navegador, que es donde se muestran los PIN.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        /**
         * El service worker nunca se cachea.
         *
         * Es la trampa clásica de las PWA: el archivo se sirve con la caché
         * larga del resto de `public/`, el navegador se queda con la versión
         * vieja durante horas y la actualización no llega nunca. El síntoma es
         * «desplegué el arreglo y en el móvil sigue igual», sin ningún error.
         */
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
