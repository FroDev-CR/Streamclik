'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Radio, ShieldAlert } from 'lucide-react';

import { PIN_TYPE_LABELS, isPinExpired, secondsUntilExpiry, type VerificationPin } from '@/core/domain/entities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCountdown, formatRelativeTime } from '@/lib/utils';

import { useLatestPin } from '../use-latest-pin';

/**
 * Visor del último PIN, actualizado en tiempo real.
 *
 * Es el componente central del producto: lo que el cliente mira mientras espera
 * el código. Client Component por necesidad — se suscribe a Realtime.
 */

interface LivePinCardProps {
  accountId: string;
  accountLabel: string;
  initialPin: VerificationPin | null;
}

export function LivePinCard({ accountId, accountLabel, initialPin }: LivePinCardProps) {
  const { pin, isConnected, justArrived } = useLatestPin({ accountId, initialPin });
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(() => (pin ? secondsUntilExpiry(pin) : 0));

  /**
   * Cuenta atrás de la expiración.
   *
   * Se calcula en el cliente y no en el servidor porque el HTML renderizado se
   * cachea: un valor fijo de "quedan 14:32" quedaría congelado en pantalla
   * mientras el código expira de verdad.
   */
  useEffect(() => {
    if (!pin) return;

    setRemaining(secondsUntilExpiry(pin));
    const interval = setInterval(() => setRemaining(secondsUntilExpiry(pin)), 1000);
    return () => clearInterval(interval);
  }, [pin]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin.code);
      setCopied(true);
    } catch {
      // `navigator.clipboard` falla en contextos no seguros y si el usuario
      // deniega el permiso. El código sigue visible y seleccionable a mano, así
      // que no merece un mensaje de error que asuste.
    }
  }

  const expired = pin ? isPinExpired(pin) : false;

  return (
    <Card className={cn('overflow-hidden', justArrived && 'ring-1 ring-[--color-accent]')}>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="truncate">{accountLabel}</CardTitle>

        {/* El estado de la conexión es información honesta: si el WebSocket está
            caído, el usuario debe saber que el código puede no aparecer solo. */}
        <span
          className="flex items-center gap-1.5 text-xs text-[--color-content-subtle]"
          title={isConnected ? 'Conectado en tiempo real' : 'Reconectando…'}
        >
          <Radio
            aria-hidden
            className={cn('size-3.5', isConnected ? 'text-green-400' : 'text-amber-400')}
          />
          <span className="hidden sm:inline">{isConnected ? 'En vivo' : 'Reconectando'}</span>
        </span>
      </CardHeader>

      <CardContent>
        {!pin ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-[--color-content-muted]">
              Aún no hay ningún código para esta cuenta
            </p>
            <p className="text-xs text-[--color-content-subtle]">
              Solicítalo desde Netflix y aparecerá aquí automáticamente
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={expired ? 'neutral' : 'accent'}>{PIN_TYPE_LABELS[pin.codeType]}</Badge>
              <span className="text-xs text-[--color-content-subtle]">
                {formatRelativeTime(pin.receivedAt)}
              </span>
            </div>

            <button
              type="button"
              onClick={copyCode}
              aria-label={`Copiar el código ${pin.code.split('').join(' ')}`}
              className={cn(
                'group flex items-center justify-between gap-4 rounded-xl border px-5 py-6 text-left transition-colors',
                expired
                  ? 'border-[--color-border] bg-[--color-surface-raised]'
                  : 'border-[--color-border-strong] bg-[--color-surface-raised] hover:border-[--color-accent]',
                justArrived && 'animate-pin-arrive',
              )}
            >
              <span
                className={cn(
                  'pin-display text-4xl font-semibold sm:text-5xl',
                  expired ? 'text-[--color-content-subtle] line-through' : 'text-[--color-content]',
                )}
              >
                {pin.code}
              </span>

              <span className="flex items-center gap-1.5 text-xs text-[--color-content-muted]">
                {copied ? (
                  <>
                    <Check aria-hidden className="size-4 text-green-400" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy aria-hidden className="size-4" /> Copiar
                  </>
                )}
              </span>
            </button>

            {/* Un código vencido se marca, nunca se oculta: si el usuario ve "sin
                código" cuando llegó uno hace 20 minutos, vuelve a pedirlo y
                genera otro correo innecesario. */}
            {expired ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <ShieldAlert aria-hidden className="size-3.5" />
                Este código ha caducado. Solicita uno nuevo desde Netflix.
              </p>
            ) : (
              <p className="text-xs text-[--color-content-subtle]">
                Caduca en <span className="pin-display">{formatCountdown(remaining)}</span>
              </p>
            )}

            {pin.actionUrl && !expired && (
              <a
                href={pin.actionUrl}
                target="_blank"
                // `noopener` evita que la página destino acceda a `window.opener`.
                rel="noopener noreferrer"
                className="text-xs text-[--color-accent-hover] underline underline-offset-4"
              >
                Abrir el enlace de confirmación de Netflix
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
