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
    ];
  },
};

export default nextConfig;
