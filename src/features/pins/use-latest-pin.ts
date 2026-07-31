'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { VerificationPin } from '@/core/domain/entities';
import { createSupabaseBrowserClient } from '@/infrastructure/supabase/client';

/**
 * Suscripción al último PIN de una cuenta.
 *
 * Se parte del PIN que el Server Component ya renderizó en el HTML; Realtime
 * aporta únicamente las **actualizaciones**. Sin ese valor inicial, la primera
 * pintura mostraría "sin código" durante el handshake del WebSocket, que es
 * justo el momento en que el usuario está mirando la pantalla.
 *
 * La seguridad no depende de este hook: Supabase Realtime evalúa las políticas
 * RLS por suscriptor, así que un cliente sin asignación vigente no recibe el
 * evento aunque se suscriba al canal a mano. El filtro por `account_id` de aquí
 * es una optimización de renders, no una barrera.
 */

interface UseLatestPinOptions {
  accountId: string;
  initialPin: VerificationPin | null;
}

interface UseLatestPinResult {
  pin: VerificationPin | null;
  isConnected: boolean;
  /** Se activa brevemente cuando llega un PIN nuevo, para animar la tarjeta. */
  justArrived: boolean;
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

export function useLatestPin({ accountId, initialPin }: UseLatestPinOptions): UseLatestPinResult {
  const [pin, setPin] = useState<VerificationPin | null>(initialPin);
  const [isConnected, setIsConnected] = useState(false);
  const [justArrived, setJustArrived] = useState(false);

  // El token de Clerk es lo que RLS evalúa para decidir si este navegador puede
  // recibir el evento. Sin él la suscripción se establece igual, pero Postgres
  // no emite nada: el síntoma es una tarjeta que nunca se actualiza y ningún
  // error en consola.
  const { getToken } = useAuth();

  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPin = useCallback((next: VerificationPin) => {
    setPin((current) => {
      // Guardia contra el desorden de llegada: un evento retrasado no debe
      // sustituir a un código más reciente ya mostrado. Ocurre de verdad cuando
      // el WebSocket se reconecta y reenvía eventos.
      if (current && new Date(next.receivedAt) <= new Date(current.receivedAt)) {
        return current;
      }
      return next;
    });

    setJustArrived(true);
    if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
    arrivalTimer.current = setTimeout(() => setJustArrived(false), 1200);
  }, []);

  /**
   * Re-consulta el último PIN.
   *
   * Se ejecuta al reconectar y al recuperar el foco de la pestaña. Un WebSocket
   * caído durante 30 segundos pierde los eventos de ese intervalo, y sin este
   * re-fetch la interfaz mostraría un código antiguo con total confianza. El caso
   * realista es el móvil que se bloquea y se desbloquea justo cuando llega el
   * código.
   */
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient(getToken);

    const { data } = await supabase
      .from('verification_pins')
      .select('id, account_id, code, code_type, action_url, received_at, expires_at')
      .eq('account_id', accountId)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) applyPin(toEntity(data as PinRow));
  }, [accountId, applyPin, getToken]);

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
        (payload) => applyPin(toEntity(payload.new as PinRow)),
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
  }, [accountId, applyPin, refetch, getToken]);

  return { pin, isConnected, justArrived };
}
