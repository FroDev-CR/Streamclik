'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Radio, ShieldAlert, Users } from 'lucide-react';

import {
  LIVE_PIN_WINDOW_SECONDS,
  PIN_TYPE_LABELS,
  isPinExpired,
  secondsUntilExpiry,
  type VerificationPin,
} from '@/core/domain/entities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCountdown, formatRelativeTime } from '@/lib/utils';

import { useLivePins } from '../use-live-pins';

/**
 * Visor de los códigos en vivo, actualizado en tiempo real.
 *
 * Es el componente central del producto: lo que el cliente mira mientras espera
 * el código. Client Component por necesidad — se suscribe a Realtime.
 *
 * Muestra una pila y no un único código. Los perfiles de una cuenta comparten
 * buzón, así que dos inquilinos que piden código con un minuto de diferencia
 * generan dos correos. Antes el segundo sustituía al primero en pantalla: quien
 * había pedido primero veía el código de otro sin enterarse. Ahora conviven, con
 * su hora, y un aviso explica cómo distinguirlos.
 */

const VENTANA_MINUTOS = Math.round(LIVE_PIN_WINDOW_SECONDS / 60);

function CodigoEnVivo({
  pin,
  now,
  destacado,
  reciénLlegado,
}: {
  pin: VerificationPin;
  now: Date;
  /** Único en pantalla, o el más reciente de la pila. */
  destacado: boolean;
  reciénLlegado: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(pin.code);
      setCopied(true);
    } catch {
      // `navigator.clipboard` falla en contextos no seguros y si el usuario
      // deniega el permiso. El código sigue visible y seleccionable a mano, así
      // que no merece un mensaje de error que asuste.
    }
  }

  // La caducidad sigue siendo la real de Netflix (~15 min), no la ventana de la
  // vista. Un código puede salir de aquí y seguir sirviendo; decir lo contrario
  // haría que el cliente pidiera otro para nada.
  const expired = isPinExpired(pin, now);
  const remaining = secondsUntilExpiry(pin, now);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={expired ? 'neutral' : 'accent'}>{PIN_TYPE_LABELS[pin.codeType]}</Badge>

        {/* `suppressHydrationWarning` porque el texto **debe** diferir: el
            servidor lo calcula al renderizar y el cliente uno o dos segundos
            después, al hidratar. Sin esto React avisa de un desajuste en cada
            carga y regenera el subárbol. Es el uso para el que existe el
            atributo, no una forma de tapar un error. */}
        <span suppressHydrationWarning className="text-xs text-[var(--color-content-subtle)]">
          {formatRelativeTime(pin.receivedAt, now)}
        </span>
      </div>

      <button
        type="button"
        onClick={copyCode}
        aria-label={`Copiar el código ${pin.code.split('').join(' ')}`}
        className={cn(
          'group flex items-center justify-between gap-4 rounded-2xl border-[3px] border-[var(--color-border)] px-5 py-6 text-left',
          'transition-[transform,box-shadow] duration-100',
          expired
            ? 'bg-[var(--color-canvas)] shadow-[4px_4px_0_var(--color-border)]'
            : // Amarillo de marca para el código vigente: es el objeto que el
              // usuario vino a buscar y debe ganar a todo lo demás.
              'bg-[var(--color-brand-yellow)] shadow-[6px_6px_0_var(--color-border)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_var(--color-border)]',
          reciénLlegado && 'animate-pin-arrive',
        )}
      >
        <span
          className={cn(
            'pin-display font-black',
            // En una pila, todos los códigos son igual de legítimos: el más
            // reciente sólo se agranda cuando está solo, para no sugerir que es
            // «el bueno» cuando hay dos personas esperando.
            destacado ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl',
            expired
              ? 'text-[var(--color-content-subtle)] line-through'
              : 'text-[var(--color-content)]',
          )}
        >
          {pin.code}
        </span>

        <span className="flex items-center gap-1.5 text-xs text-[var(--color-content-muted)]">
          {copied ? (
            <>
              <Check aria-hidden className="size-4 text-[var(--color-success)]" /> Copiado
            </>
          ) : (
            <>
              <Copy aria-hidden className="size-4" /> Copiar
            </>
          )}
        </span>
      </button>

      {expired ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
          <ShieldAlert aria-hidden className="size-3.5" />
          Este código ha caducado. Solicita uno nuevo desde Netflix.
        </p>
      ) : (
        <p className="text-xs text-[var(--color-content-subtle)]">
          Caduca en{' '}
          <span suppressHydrationWarning className="pin-display">
            {formatCountdown(remaining)}
          </span>
        </p>
      )}

      {pin.actionUrl && !expired && (
        <a
          href={pin.actionUrl}
          target="_blank"
          // `noopener` evita que la página destino acceda a `window.opener`.
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-accent-hover)] underline underline-offset-4"
        >
          Abrir el enlace de confirmación de Netflix
        </a>
      )}
    </div>
  );
}

interface LivePinCardProps {
  accountId: string;
  accountLabel: string;
  initialPins: VerificationPin[];
}

export function LivePinCard({ accountId, accountLabel, initialPins }: LivePinCardProps) {
  const { pins, isConnected, justArrivedId, now } = useLivePins({ accountId, initialPins });

  const hayVarios = pins.length > 1;

  return (
    <Card className={cn('overflow-hidden', justArrivedId && 'ring-1 ring-[var(--color-accent)]')}>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="truncate">{accountLabel}</CardTitle>

        {/* El estado de la conexión es información honesta: si el WebSocket está
            caído, el usuario debe saber que el código puede no aparecer solo. */}
        <span
          className="flex items-center gap-1.5 text-xs text-[var(--color-content-subtle)]"
          title={isConnected ? 'Conectado en tiempo real' : 'Reconectando…'}
        >
          <Radio
            aria-hidden
            className={cn(
              'size-3.5',
              isConnected ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]',
            )}
          />
          <span className="hidden sm:inline">{isConnected ? 'En vivo' : 'Reconectando'}</span>
        </span>
      </CardHeader>

      <CardContent>
        {pins.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-[var(--color-content-muted)]">
              Aún no hay ningún código reciente
            </p>
            <p className="text-xs text-[var(--color-content-subtle)]">
              Solicítalo desde Netflix y aparecerá aquí automáticamente
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* El aviso sólo aparece cuando de verdad hay ambigüedad. Ponerlo
                siempre lo convertiría en decoración que nadie lee justo el día
                que importa. */}
            {hayVarios && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2.5 text-xs leading-relaxed"
              >
                <Users aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                <span>
                  Llegaron <strong>{pins.length} códigos</strong> casi a la vez: alguien más de esta
                  cuenta también pidió uno. Fíjate en la hora — el tuyo es el que llegó justo
                  después de pedirlo.
                </span>
              </p>
            )}

            {/* Sin líneas divisorias entre códigos: con la sombra dura de cada
                tarjeta amarilla, el trazo extra quedaba justo debajo de la
                cuenta atrás y se leía como parte de ella. El hueco basta. */}
            <div className="flex flex-col gap-5">
              {pins.map((pin, indice) => (
                <CodigoEnVivo
                  key={pin.id}
                  pin={pin}
                  now={now}
                  destacado={!hayVarios && indice === 0}
                  reciénLlegado={pin.id === justArrivedId}
                />
              ))}
            </div>

            <p className="text-xs text-[var(--color-content-subtle)]">
              Los códigos se quedan aquí {VENTANA_MINUTOS} minutos. Después los encuentras en el
              historial, más abajo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
