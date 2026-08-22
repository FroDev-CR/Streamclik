'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LIVE_PIN_WINDOW_SECONDS,
  MAX_LIVE_PINS,
  selectLivePins,
  type VerificationPin,
} from '@/core/domain/entities';
import { createSupabaseBrowserClient } from '@/infrastructure/supabase/client';

/**
 * Suscripción a los códigos en vivo de una cuenta.
 *
 * Se parte de los que el Server Component ya renderizó en el HTML; Realtime
 * aporta únicamente las **novedades**. Sin ese valor inicial, la primera pintura
 * mostraría "sin código" durante el handshake del WebSocket, que es justo el
 * momento en que el usuario está mirando la pantalla.
 *
 * Devuelve una **lista** y no un único código. Antes devolvía uno solo y el que
 * llegaba sustituía al anterior: como los perfiles de una cuenta comparten
 * buzón, dos inquilinos pidiendo código con un minuto de diferencia hacían que
 * el primero viera desaparecer el suyo y tomara por bueno el del otro. Ahora
 * conviven, ordenados por hora de llegada, hasta `MAX_LIVE_PINS`.
 *
 * La seguridad no depende de este hook: Supabase Realtime evalúa las políticas
 * RLS por suscriptor, así que un cliente sin asignación vigente no recibe el
 * evento aunque se suscriba al canal a mano. El filtro por `account_id` de aquí
 * es una optimización de renders, no una barrera.
 */

interface UseLivePinsOptions {
  accountId: string;
  initialPins: VerificationPin[];
}

interface UseLivePinsResult {
  /** Los de la ventana, del más reciente al más antiguo. */
  pins: VerificationPin[];
  isConnected: boolean;
  /** Identificador del último que llegó estando la página abierta, para animarlo. */
  justArrivedId: string | null;
  /**
   * Reloj compartido, actualizado cada segundo.
   *
   * Se expone para que las cuentas atrás de las tarjetas y el descarte por
   * ventana usen **el mismo instante**. Con un intervalo por tarjeta, un código
   * podía desaparecer de la lista un segundo antes de que su propio contador lo
   * reflejara.
   */
  now: Date;
  /**
   * Vuelve a consultar los códigos de la ventana, ahora.
   *
   * Se expone porque el estado inicial sólo se lee al montar: cuando una Server
   * Action acaba de crear un PIN, el servidor manda datos frescos que este hook
   * ya no mira. Sin esto, el código aparecería únicamente cuando Realtime se
   * decidiera a entregarlo —normalmente rápido, a veces no— y el usuario se
   * queda mirando un hueco vacío después de que le dijimos «listo».
   */
  refetch: () => Promise<void>;
}

type PinRow = {
  id: string;
  account_id: string;
  code: string;
  code_type: VerificationPin['codeType'];
  action_url: string | null;
  received_at: string;
  expires_at: string;
};

function toEntity(row: PinRow): VerificationPin {
  return {
    id: row.id,
    accountId: row.account_id,
    code: row.code,
    codeType: row.code_type,
    actionUrl: row.action_url,
    receivedAt: row.received_at,
    expiresAt: row.expires_at,
  };
}

export function useLivePins({ accountId, initialPins }: UseLivePinsOptions): UseLivePinsResult {
  const [recibidos, setRecibidos] = useState<VerificationPin[]>(initialPins);
  const [isConnected, setIsConnected] = useState(false);
  const [justArrivedId, setJustArrivedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // El token de Clerk es lo que RLS evalúa para decidir si este navegador puede
  // recibir el evento. Sin él la suscripción se establece igual, pero Postgres
  // no emite nada: el síntoma es una tarjeta que nunca se actualiza y ningún
  // error en consola.
  const { getToken } = useAuth();

  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Un único intervalo para toda la vista: contadores y descarte por ventana. */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const incorporar = useCallback((entrantes: VerificationPin[], animar: boolean) => {
    if (entrantes.length === 0) return;

    setRecibidos((actuales) => {
      // De-duplica por id: el re-fetch tras reconectar devuelve códigos que la
      // suscripción ya había entregado, y sin esto saldrían repetidos.
      const porId = new Map(actuales.map((pin) => [pin.id, pin]));
      let hayNuevos = false;

      for (const pin of entrantes) {
        if (!porId.has(pin.id)) hayNuevos = true;
        porId.set(pin.id, pin);
      }

      if (!hayNuevos) return actuales;

      // Se guarda algo más de lo que se muestra: si el más reciente sale de la
      // ventana, los de detrás siguen ahí sin volver a consultar.
      return [...porId.values()]
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        .slice(0, MAX_LIVE_PINS * 2);
    });

    if (!animar) return;

    const masReciente = [...entrantes].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )[0];

    if (!masReciente) return;

    setJustArrivedId(masReciente.id);
    if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
    arrivalTimer.current = setTimeout(() => setJustArrivedId(null), 1200);
  }, []);

  /**
   * Re-consulta los códigos de la ventana.
   *
   * Se ejecuta al reconectar y al recuperar el foco de la pestaña. Un WebSocket
   * caído durante 30 segundos pierde los eventos de ese intervalo, y sin este
   * re-fetch la interfaz mostraría un código antiguo con total confianza. El caso
   * realista es el móvil que se bloquea y se desbloquea justo cuando llega el
   * código.
   */
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient(getToken);
    const desde = new Date(Date.now() - LIVE_PIN_WINDOW_SECONDS * 1000).toISOString();

    const { data } = await supabase
      .from('verification_pins')
      .select('id, account_id, code, code_type, action_url, received_at, expires_at')
      .eq('account_id', accountId)
      .gte('received_at', desde)
      .order('received_at', { ascending: false })
      .limit(MAX_LIVE_PINS);

    // Sin animar: al recuperar el foco, lo que se recupera es estado que ya
    // existía, no una llegada nueva que merezca llamar la atención.
    incorporar(
      (data ?? []).map((row) => toEntity(row as PinRow)),
      false,
    );
  }, [accountId, getToken, incorporar]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient(getToken);

    const channel = supabase
      .channel(`pins:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'verification_pins',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => incorporar([toEntity(payload.new as PinRow)], true),
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        // Al recuperar la conexión se recuperan también los eventos perdidos
        // durante el corte.
        if (status === 'SUBSCRIBED') void refetch();
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
      // Sin `removeChannel`, cada navegación deja un WebSocket abierto y la
      // pestaña acumula conexiones hasta que Supabase corta por límite.
      void supabase.removeChannel(channel);
    };
  }, [accountId, incorporar, refetch, getToken]);

  const pins = useMemo(() => selectLivePins(recibidos, now), [recibidos, now]);

  return { pins, isConnected, justArrivedId, now, refetch };
}
