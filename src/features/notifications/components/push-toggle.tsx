'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { borrarSuscripcionPushAction, guardarSuscripcionPushAction } from '../actions';

/**
 * Activar los avisos de pago en este dispositivo.
 *
 * «En este dispositivo» no es un matiz: el permiso de notificaciones lo concede
 * cada navegador por separado, así que el operador tiene que activarlo tanto en
 * el móvil como en el escritorio si quiere el aviso en ambos. Por eso el estado
 * se lee del navegador y no de la base de datos —lo que importa es si *este*
 * aparato está suscrito, no si lo está alguno.
 *
 * En iOS hay una condición que sorprende: Safari sólo permite notificaciones si
 * la aplicación está **instalada** en la pantalla de inicio. Desde la pestaña
 * normal, `Notification` ni siquiera existe, y por eso el mensaje lo explica en
 * vez de mostrar un botón que no haría nada.
 */

type Estado = 'cargando' | 'no-soportado' | 'requiere-instalar' | 'activo' | 'inactivo' | 'bloqueado';

/**
 * El navegador espera la clave pública como bytes, no como base64url.
 *
 * Se construye sobre un `ArrayBuffer` explícito y no con `Uint8Array.from`
 * porque `applicationServerKey` exige un `BufferSource` respaldado por un
 * `ArrayBuffer` concreto, y el tipo genérico que infiere `from` no encaja.
 */
function claveAplicacion(base64url: string) {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);

  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let indice = 0; indice < crudo.length; indice += 1) {
    bytes[indice] = crudo.charCodeAt(indice);
  }

  return bytes;
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // En iOS, fuera de la app instalada, `Notification` no está definido.
      const enStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;

      setEstado(enStandalone ? 'no-soportado' : 'requiere-instalar');
      return;
    }

    if (Notification.permission === 'denied') {
      setEstado('bloqueado');
      return;
    }

    void (async () => {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      setEstado(suscripcion ? 'activo' : 'inactivo');
    })();
  }, []);

  async function activar() {
    setMensaje(null);

    const permiso = await Notification.requestPermission();

    if (permiso !== 'granted') {
      setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo');
      return;
    }

    const registro = await navigator.serviceWorker.ready;

    const suscripcion = await registro.pushManager.subscribe({
      // Obligatorio en todos los navegadores actuales: no se admiten avisos
      // silenciosos, cada push tiene que mostrar una notificación visible.
      userVisibleOnly: true,
      applicationServerKey: claveAplicacion(vapidPublicKey),
    });

    const datos = suscripcion.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    startTransition(async () => {
      const resultado = await guardarSuscripcionPushAction({
        endpoint: datos.endpoint ?? '',
        p256dh: datos.keys?.p256dh ?? '',
        auth: datos.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      });

      if (resultado.error) {
        setMensaje(resultado.error);
        return;
      }

      setEstado('activo');
      setMensaje(resultado.success ?? null);
    });
  }

  async function desactivar() {
    setMensaje(null);

    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();

    if (!suscripcion) {
      setEstado('inactivo');
      return;
    }

    const endpoint = suscripcion.endpoint;
    await suscripcion.unsubscribe();

    startTransition(async () => {
      const resultado = await borrarSuscripcionPushAction(endpoint);
      setEstado('inactivo');
      setMensaje(resultado.error ?? resultado.success ?? null);
    });
  }

  if (estado === 'cargando') return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)]">
            {estado === 'activo' ? (
              <BellRing aria-hidden className="size-5 text-[var(--color-accent)]" strokeWidth={2.5} />
            ) : (
              <Bell aria-hidden className="size-5" strokeWidth={2.5} />
            )}
          </span>

          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-sm font-black uppercase">
              Avisos de pago
            </p>
            <p className="text-xs text-[var(--color-content-muted)]">
              {estado === 'activo' &&
                'Este dispositivo te avisará en cuanto un cliente suba su comprobante.'}
              {estado === 'inactivo' &&
                'Actívalos y te llega una notificación al instante, sin tener que mirar el panel.'}
              {estado === 'bloqueado' &&
                'Bloqueaste las notificaciones para este sitio. Hay que volver a permitirlas desde los ajustes del navegador.'}
              {estado === 'requiere-instalar' &&
                'En iPhone hay que instalar la aplicación en la pantalla de inicio antes de poder recibir avisos: Compartir → Añadir a inicio.'}
              {estado === 'no-soportado' && 'Este navegador no admite notificaciones.'}
            </p>
            {mensaje && <p className="mt-1 text-xs font-semibold">{mensaje}</p>}
          </div>
        </div>

        {estado === 'inactivo' && (
          <Button type="button" size="sm" onClick={activar} disabled={pendiente}>
            <Bell aria-hidden className="size-4" strokeWidth={2.5} />
            {pendiente ? 'Activando…' : 'Activar avisos'}
          </Button>
        )}

        {estado === 'activo' && (
          <Button type="button" size="sm" variant="secondary" onClick={desactivar} disabled={pendiente}>
            <BellOff aria-hidden className="size-4" strokeWidth={2.5} />
            Desactivar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
