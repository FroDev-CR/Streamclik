'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que hace instalable la aplicación.
 *
 * Se hace desde un componente de cliente y no con una etiqueta `<script>` suelta
 * para que el registro ocurra una sola vez por carga y con el ciclo de vida de
 * React, no en cada navegación del App Router.
 *
 * Va tras `load` a propósito: registrar durante el arranque compite por ancho de
 * banda con el JavaScript que la página necesita para ser interactiva, y en un
 * teléfono con datos flojos eso se nota en el primer toque.
 *
 * En desarrollo no se registra. Un service worker sirviendo los `chunks`
 * cacheados de una sesión anterior es la causa de la mitad de los «pero si ya lo
 * arreglé» al recargar con el servidor de desarrollo delante.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Un registro fallido no rompe nada: la aplicación funciona igual, sólo
        // deja de ser instalable. No merece un error en pantalla.
      });
    };

    if (document.readyState === 'complete') {
      registrar();
      return;
    }

    window.addEventListener('load', registrar);
    return () => window.removeEventListener('load', registrar);
  }, []);

  return null;
}
