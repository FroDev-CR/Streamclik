'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Avisa al contador de visitas cuando alguien abre una página pública.
 *
 * La marca de sesión es aleatoria y vive en `sessionStorage`: se pierde al
 * cerrar la pestaña. Sirve para saber que cinco páginas vistas son una sola
 * persona, y no permite reconocerla mañana. Sin IP ni huella de navegador, no
 * hay dato personal en juego y no hace falta banner de cookies.
 *
 * `sendBeacon` cuando existe: entrega la petición aunque el visitante cierre la
 * pestaña en ese instante, que es justo cuando se pierden las visitas cortas —
 * las que más interesa contar, porque son las que se van sin comprar.
 */

const CLAVE_SESION = 'streamclick:sesion';

function idDeSesion(): string | null {
  try {
    const existente = sessionStorage.getItem(CLAVE_SESION);
    if (existente) return existente;

    const nuevo = crypto.randomUUID();
    sessionStorage.setItem(CLAVE_SESION, nuevo);
    return nuevo;
  } catch {
    // Almacenamiento bloqueado (modo privado estricto, permisos). Sin marca de
    // sesión no se cuenta: preferible perder el dato a inventarse uno nuevo en
    // cada página y multiplicar las visitas por cinco.
    return null;
  }
}

export function VisitTracker() {
  const pathname = usePathname();

  // El panel de Next en desarrollo monta los efectos dos veces; sin esto cada
  // visita se contaría por duplicado en local.
  const ultimaRuta = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (ultimaRuta.current === pathname) return;
    ultimaRuta.current = pathname;

    const sessionId = idDeSesion();
    if (!sessionId) return;

    const datos = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      sessionId,
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/visita', new Blob([datos], { type: 'application/json' }));
        return;
      }

      void fetch('/api/visita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: datos,
        keepalive: true,
      }).catch(() => {
        // El contador nunca debe hacer ruido en la consola del visitante.
      });
    } catch {
      // Idem.
    }
  }, [pathname]);

  return null;
}
