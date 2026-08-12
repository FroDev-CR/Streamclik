/* eslint-disable no-restricted-globals */

/**
 * Service worker de StreamClick.
 *
 * Existe por dos motivos, en este orden:
 *
 *   1. Chrome no ofrece instalar la aplicación si no hay un service worker con
 *      manejador de `fetch`. Sin este archivo, el manifiesto solo no basta.
 *   2. Da una pantalla decente cuando el teléfono se queda sin datos, en vez del
 *      dinosaurio del navegador dentro de una ventana que dice «StreamClick».
 *
 * Lo que **no** hace, deliberadamente: cachear páginas.
 *
 * Esta aplicación muestra credenciales de cuentas y códigos de verificación
 * detrás de sesión. Un service worker que guardara respuestas de navegación
 * serviría el panel de un usuario al siguiente que abriera la aplicación en el
 * mismo teléfono —el móvil compartido de una familia es exactamente el caso—, y
 * lo haría saltándose Clerk y saltándose RLS, porque la respuesta ya está en el
 * disco. Es la clase de fallo que las políticas del servidor no pueden atrapar.
 *
 * Así que sólo se cachea `/_next/static/*`, que Next publica con huella en el
 * nombre: son inmutables por construcción y no contienen datos de nadie.
 */

// Subir la versión invalida las cachés viejas en el siguiente `activate`.
const VERSION = 'v1';
const CACHE_ESTATICO = `streamclick-estatico-${VERSION}`;
const CACHE_SHELL = `streamclick-shell-${VERSION}`;

const RUTA_SIN_CONEXION = '/sin-conexion';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      // Si la página de respaldo no se puede precargar, la instalación sigue: un
      // service worker que falla al instalar deja la aplicación sin instalable.
      await cache.add(RUTA_SIN_CONEXION).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();

      await Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_ESTATICO && nombre !== CACHE_SHELL)
          .map((nombre) => caches.delete(nombre)),
      );

      // Toma el control de las pestañas ya abiertas sin esperar a que se
      // cierren; si no, la primera visita tras instalar se queda sin worker.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Sólo GET: un POST cacheado sería un pedido duplicado o un comprobante
  // reenviado.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nada de otros orígenes: Supabase, Clerk y las URL firmadas de Storage tienen
  // que llegar siempre frescas y con sus propias cabeceras.
  if (url.origin !== self.location.origin) return;

  // El webhook y las rutas de API nunca se tocan.
  if (url.pathname.startsWith('/api/')) return;

  // Recursos con huella en el nombre: cache-first sin riesgo. Es lo que hace que
  // la aplicación abra al instante en una conexión mala.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cacheado = await caches.match(request);
        if (cacheado) return cacheado;

        const respuesta = await fetch(request);

        if (respuesta.ok) {
          const cache = await caches.open(CACHE_ESTATICO);
          cache.put(request, respuesta.clone());
        }

        return respuesta;
      })(),
    );
    return;
  }

  // Navegaciones: SIEMPRE red. Nunca se guarda el HTML, por lo explicado arriba.
  // Sólo si la red falla se muestra la página de respaldo.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const respaldo = await caches.match(RUTA_SIN_CONEXION);
          return (
            respaldo ??
            new Response('Sin conexión', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })(),
    );
  }

  // Todo lo demás pasa de largo al comportamiento normal del navegador.
});

/**
 * Avisos de pago.
 *
 * El operador necesita enterarse en el momento en que un cliente sube su
 * comprobante: ya pagó y está esperando su cuenta. Sin esto habría que mirar el
 * panel cada cierto rato.
 *
 * El contenido llega cifrado de punta a punta (RFC 8291): ni Google ni Apple
 * pueden leerlo, sólo este service worker.
 */
self.addEventListener('push', (event) => {
  // `showNotification` DEBE llamarse siempre que llega un push. Si no, el
  // navegador muestra una notificación genérica de «este sitio se actualizó en
  // segundo plano» y, si se repite, acaba revocando el permiso.
  event.waitUntil(
    (async () => {
      let datos = {};

      try {
        datos = event.data ? event.data.json() : {};
      } catch {
        // Carga malformada: se avisa igual, sin detalles, en vez de callar.
      }

      const titulo = datos.titulo || 'StreamClick';

      await self.registration.showNotification(titulo, {
        body: datos.cuerpo || 'Tienes algo pendiente en el panel.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // Agrupa por etiqueta: tres pagos seguidos no dejan tres notificaciones
        // apiladas, sino una sola actualizada con la última.
        tag: datos.etiqueta || 'streamclick',
        renotify: true,
        data: { url: datos.url || '/admin/pagos' },
      });
    })(),
  );
});

/**
 * Al tocar la notificación, ir al panel.
 *
 * Se reutiliza una pestaña ya abierta en lugar de abrir otra: el operador suele
 * tener la aplicación abierta, y acabar con cuatro copias del panel tras cuatro
 * avisos es molesto y desorienta.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const destino = (event.notification.data && event.notification.data.url) || '/admin/pagos';

  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const cliente of clientes) {
        if (new URL(cliente.url).origin === self.location.origin) {
          await cliente.focus();
          if ('navigate' in cliente) await cliente.navigate(destino);
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});
