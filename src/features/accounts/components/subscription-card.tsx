'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Radio,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';

import {
  LIVE_PIN_WINDOW_SECONDS,
  PIN_TYPE_LABELS,
  VENTANA_RENOVACION_DIAS,
  isPinExpired,
  puedeRenovar,
  secondsUntilExpiry,
  type VerificationPin,
} from '@/core/domain/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RequestCodeButton } from '@/features/pins/components/request-code-button';
import { useLivePins } from '@/features/pins/use-live-pins';
import type { CodeProvider } from '@/infrastructure/supabase/database.types';
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
  /** La asignación es lo que se renueva, no la cuenta. */
  assignmentId: string;
  serviceName: string;
  brandColor: string;
  profileLabel: string;
  loginEmail: string;
  loginPassword: string | null;
  profilePin: string | null;
  expiresAt: string | null;
  initialPins: VerificationPin[];
  /**
   * De dónde llega el código. Con `propio` el correo entra solo por el webhook y
   * no hay nada que pedir; con un proveedor externo hay que ir a buscarlo, y por
   * eso aparece el botón.
   */
  codeProvider: CodeProvider;
}

const VENTANA_MINUTOS = Math.round(LIVE_PIN_WINDOW_SECONDS / 60);

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

/**
 * Un código dentro de la tarjeta.
 *
 * Es un componente aparte porque cada código necesita su propio estado de
 * «copiado»: con un único estado compartido, copiar el segundo marcaba también
 * el primero como copiado, que es exactamente la confusión que este cambio
 * pretende evitar.
 */
function CodigoVivo({
  pin,
  now,
  reciénLlegado,
  unico,
}: {
  pin: VerificationPin;
  now: Date;
  reciénLlegado: boolean;
  unico: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(pin.code);
      setCopiado(true);
    } catch {
      /* el código sigue visible */
    }
  }

  // La caducidad es la real de Netflix (~15 min), no la ventana de esta vista:
  // un código puede salir de aquí y seguir funcionando.
  const vencido = isPinExpired(pin, now);
  const restante = secondsUntilExpiry(pin, now);

  return (
    <div>
      <button
        type="button"
        onClick={copiarCodigo}
        aria-label={`Copiar el código ${pin.code.split('').join(' ')}`}
        className={cn(
          'flex w-full items-center justify-between gap-4 rounded-2xl border-[3px] border-[var(--color-border)] px-5 py-5 text-left',
          'transition-[transform,box-shadow] duration-100',
          vencido
            ? 'bg-[var(--color-canvas)] shadow-[4px_4px_0_var(--color-border)]'
            : // Amarillo de marca para el código vigente: es el objeto que el
              // usuario vino a buscar y debe ganar a todo lo demás.
              'bg-[var(--color-brand-yellow)] shadow-[6px_6px_0_var(--color-border)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_var(--color-border)]',
          reciénLlegado && 'animate-pin-arrive',
        )}
      >
        <span
          className={cn(
            // Cuando hay varios no se agranda ninguno: todos son igual de
            // legítimos y destacar el más reciente sugeriría que es «el bueno».
            'pin-display font-black',
            unico ? 'text-4xl' : 'text-3xl',
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
          /* `suppressHydrationWarning` porque el texto **debe** diferir: el
             servidor lo calcula al renderizar y el cliente uno o dos segundos
             después, al hidratar. Sin esto React avisa de un desajuste en cada
             carga y regenera el subárbol. Es el uso para el que existe el
             atributo, no una forma de tapar un error. */
          /* El atributo NO se propaga a los elementos hijos: hace falta también
             en el `span` de la cuenta atrás, que es otro nodo de texto. */
          <span suppressHydrationWarning className="text-xs text-[var(--color-content-muted)]">
            Caduca en{' '}
            <span suppressHydrationWarning className="pin-display">
              {formatCountdown(restante)}
            </span>{' '}
            · {formatRelativeTime(pin.receivedAt, now)}
          </span>
        )}
      </div>
    </div>
  );
}

export function SubscriptionCard({
  accountId,
  assignmentId,
  serviceName,
  brandColor,
  profileLabel,
  loginEmail,
  loginPassword,
  profilePin,
  expiresAt,
  initialPins,
  codeProvider,
}: SubscriptionCardProps) {
  const { pins, isConnected, justArrivedId, now, refetch } = useLivePins({
    accountId,
    initialPins,
  });

  const hayVarios = pins.length > 1;
  const esDeProveedor = codeProvider !== 'propio';

  const diasRestantes = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const porVencer = diasRestantes !== null && diasRestantes <= 3;

  const renovable = puedeRenovar({ status: 'active', expiresAt });

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

        {pins.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-[var(--color-content-subtle)] px-4 py-6 text-center">
            <p className="text-sm text-[var(--color-content-muted)]">
              Aún no hay ningún código reciente
            </p>
            <p className="mt-1 text-xs text-[var(--color-content-subtle)]">
              {esDeProveedor
                ? `Pídelo en ${serviceName} y luego toca el botón`
                : `Solicítalo desde ${serviceName} y aparecerá aquí solo`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* El aviso sólo sale cuando de verdad hay ambigüedad. Mostrarlo
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

            {pins.map((pin) => (
              <CodigoVivo
                key={pin.id}
                pin={pin}
                now={now}
                reciénLlegado={pin.id === justArrivedId}
                unico={!hayVarios}
              />
            ))}

            <p className="text-[0.68rem] text-[var(--color-content-subtle)]">
              Los códigos se quedan aquí {VENTANA_MINUTOS} minutos.
            </p>
          </div>
        )}

        {/* El botón vive aquí y no en una pantalla aparte porque el momento de
            uso es el mismo que el del resto de la tarjeta: el cliente delante
            del televisor. Va debajo del visor —haya código o no— para que el
            gesto sea siempre el mismo: pedir, y mirar justo encima. */}
        {esDeProveedor && (
          <div className="mt-4">
            <RequestCodeButton accountId={accountId} onCodigoRecibido={refetch} />
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[var(--color-border)] px-4 py-3">
          <p className="text-xs text-[var(--color-content-muted)]">
            {diasRestantes !== null && diasRestantes <= 0 ? (
              <>
                Tu acceso <strong>venció</strong> el {formatDateTime(expiresAt)}
              </>
            ) : (
              <>
                Tu acceso vence el <strong>{formatDateTime(expiresAt)}</strong>
              </>
            )}
          </p>

          {/* El botón aparece siempre que hay vencimiento, pero sólo se enciende
              dentro de la ventana. Apagado y con la fecha delante avisa de que
              hay algo que hacer; escondido hasta el último día haría que quien
              mira su panel el día 28 no se entere de nada. */}
          {renovable ? (
            <Link href={`/renovar/${assignmentId}`}>
              <Button size="sm">
                <RefreshCw aria-hidden className="size-4" strokeWidth={2.5} />
                Renovar
              </Button>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--color-content-subtle)]">
              <RefreshCw aria-hidden className="size-3.5" strokeWidth={2.5} />
              Podrás renovar {VENTANA_RENOVACION_DIAS} días antes
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
