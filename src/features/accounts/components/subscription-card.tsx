'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Radio, ShieldAlert } from 'lucide-react';

import {
  PIN_TYPE_LABELS,
  isPinExpired,
  secondsUntilExpiry,
  type VerificationPin,
} from '@/core/domain/entities';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLatestPin } from '@/features/pins/use-latest-pin';
import { cn, formatCountdown, formatDateTime, formatRelativeTime } from '@/lib/utils';

/**
 * Una suscripción del cliente, con todo lo que necesita en una sola tarjeta:
 * el código en vivo, los datos de acceso y hasta cuándo tiene contratado.
 *
 * Se muestra todo junto y no repartido entre pantallas porque el momento de uso
 * real es siempre el mismo: el cliente está delante del televisor, Netflix le
 * pide un código y quiere resolverlo sin navegar. Un clic de más ahí es un clic
 * de más con la pantalla de "verificando" esperando.
 */

interface SubscriptionCardProps {
  accountId: string;
  serviceName: string;
  brandColor: string;
  profileLabel: string;
  loginEmail: string;
  loginPassword: string | null;
  profilePin: string | null;
  expiresAt: string | null;
  initialPin: VerificationPin | null;
}

/** Campo copiable con opción de ocultar, para las credenciales. */
function CampoCopiable({
  etiqueta,
  valor,
  oculto = false,
}: {
  etiqueta: string;
  valor: string;
  oculto?: boolean;
}) {
  const [visible, setVisible] = useState(!oculto);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      // Sin portapapeles (contexto no seguro o permiso denegado) el valor sigue
      // visible y seleccionable a mano: no merece un error que asuste.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--color-content-subtle)]">
          {etiqueta}
        </span>
        <span className="truncate font-mono text-sm">
          {visible ? valor : '•'.repeat(Math.min(valor.length, 12))}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {oculto && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? `Ocultar ${etiqueta}` : `Mostrar ${etiqueta}`}
            className="grid size-8 place-items-center rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            {visible ? (
              <EyeOff aria-hidden className="size-3.5" />
            ) : (
              <Eye aria-hidden className="size-3.5" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={copiar}
          aria-label={`Copiar ${etiqueta}`}
          className="grid size-8 place-items-center rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          {copiado ? (
            <Check aria-hidden className="size-3.5 text-[var(--color-success)]" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

export function SubscriptionCard({
  accountId,
  serviceName,
  brandColor,
  profileLabel,
  loginEmail,
  loginPassword,
  profilePin,
  expiresAt,
  initialPin,
}: SubscriptionCardProps) {
  const { pin, isConnected, justArrived } = useLatestPin({ accountId, initialPin });
  const [copiado, setCopiado] = useState(false);
  const [restante, setRestante] = useState(() => (pin ? secondsUntilExpiry(pin) : 0));

  // La cuenta atrás se calcula en el cliente: el HTML del servidor se cachea, y
  // un "quedan 14:32" fijo seguiría en pantalla mientras el código expira.
  useEffect(() => {
    if (!pin) return;
    setRestante(secondsUntilExpiry(pin));
    const i = setInterval(() => setRestante(secondsUntilExpiry(pin)), 1000);
    return () => clearInterval(i);
  }, [pin]);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiarCodigo() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin.code);
      setCopiado(true);
    } catch {
      /* el código sigue visible */
    }
  }

  const vencido = pin ? isPinExpired(pin) : false;

  const diasRestantes = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const porVencer = diasRestantes !== null && diasRestantes <= 3;

  return (
    <Card className="overflow-hidden">
      {/* ------------------------------------------------------------ cabecera */}
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--color-border)] p-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] font-[family-name:var(--font-display)] text-lg font-black text-white"
          style={{ backgroundColor: brandColor }}
        >
          {serviceName.charAt(0)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
            {serviceName}
          </p>
          <p className="truncate text-xs text-[var(--color-content-muted)]">{profileLabel}</p>
        </div>

        <Badge tone={porVencer ? 'warning' : 'success'}>
          {diasRestantes === null
            ? 'Activa'
            : diasRestantes <= 0
              ? 'Vencida'
              : `${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`}
        </Badge>
      </div>

      {/* --------------------------------------------------------- código vivo */}
      <div className="border-b-2 border-[var(--color-border)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-[0.7rem] font-extrabold uppercase tracking-wider">
            <KeyRound aria-hidden className="size-3.5" strokeWidth={2.5} />
            Código de verificación
          </span>

          {/* El estado de la conexión es información honesta: si el WebSocket
              está caído, el usuario debe saber que puede no aparecer solo. */}
          <span
            className="flex items-center gap-1.5 text-[0.68rem] text-[var(--color-content-subtle)]"
            title={isConnected ? 'Conectado en tiempo real' : 'Reconectando…'}
          >
            <Radio
              aria-hidden
              className={cn(
                'size-3',
                isConnected ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]',
              )}
            />
            {isConnected ? 'En vivo' : 'Reconectando'}
          </span>
        </div>

        {!pin ? (
          <div className="rounded-xl border-2 border-dashed border-[var(--color-content-subtle)] px-4 py-6 text-center">
            <p className="text-sm text-[var(--color-content-muted)]">Aún no hay ningún código</p>
            <p className="mt-1 text-xs text-[var(--color-content-subtle)]">
              Solicítalo desde {serviceName} y aparecerá aquí solo
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={copiarCodigo}
              aria-label={`Copiar el código ${pin.code.split('').join(' ')}`}
              className={cn(
                'flex w-full items-center justify-between gap-4 rounded-2xl border-[3px] border-[var(--color-border)] px-5 py-5 text-left',
                'transition-[transform,box-shadow] duration-100',
                vencido
                  ? 'bg-[var(--color-canvas)] shadow-[4px_4px_0_var(--color-border)]'
                  : // Amarillo de marca para el código vigente: es el objeto que
                    // el usuario vino a buscar y debe ganar a todo lo demás.
                    'bg-[var(--color-brand-yellow)] shadow-[6px_6px_0_var(--color-border)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_var(--color-border)]',
                justArrived && 'animate-pin-arrive',
              )}
            >
              <span
                className={cn(
                  'pin-display text-4xl font-black',
                  vencido && 'text-[var(--color-content-subtle)] line-through',
                )}
              >
                {pin.code}
              </span>

              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                {copiado ? (
                  <>
                    <Check aria-hidden className="size-4" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy aria-hidden className="size-4" /> Copiar
                  </>
                )}
              </span>
            </button>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <Badge tone="neutral">{PIN_TYPE_LABELS[pin.codeType]}</Badge>

              {/* Un código vencido se marca, nunca se oculta: si el usuario ve
                  "sin código" cuando llegó uno hace 20 minutos, vuelve a pedirlo
                  y genera otro correo innecesario. */}
              {vencido ? (
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
                  <ShieldAlert aria-hidden className="size-3.5" />
                  Caducado, pide uno nuevo
                </span>
              ) : (
                <span className="text-xs text-[var(--color-content-muted)]">
                  Caduca en <span className="pin-display">{formatCountdown(restante)}</span> ·{' '}
                  {formatRelativeTime(pin.receivedAt)}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* -------------------------------------------------------- credenciales */}
      <div className="divide-y-2 divide-[var(--color-border)] p-4">
        <CampoCopiable etiqueta="Correo de acceso" valor={loginEmail} />

        {loginPassword ? (
          <CampoCopiable etiqueta="Contraseña" valor={loginPassword} oculto />
        ) : (
          // Un fallo de descifrado no debe tumbar el resto de la tarjeta: el
          // correo y el código siguen siendo útiles mientras se resuelve.
          <p className="py-2.5 text-xs text-[var(--color-warning)]">
            No se pudo mostrar la contraseña. Escríbenos y la resolvemos.
          </p>
        )}

        {profilePin && <CampoCopiable etiqueta="PIN del perfil" valor={profilePin} oculto />}
      </div>

      {expiresAt && (
        <p className="border-t-2 border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-content-muted)]">
          Tu acceso vence el <strong>{formatDateTime(expiresAt)}</strong>
        </p>
      )}
    </Card>
  );
}
