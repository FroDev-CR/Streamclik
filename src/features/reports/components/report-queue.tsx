'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCheck, ExternalLink, Inbox, MessageCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PlatformIcon } from '@/components/platform-icon';
import type { ActionState } from '@/features/shared/action-state';
import { whatsappLink } from '@/features/orders/presentation';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

import { resolverReporteAction } from '../actions';
import type { AdminReportRow } from '../queries';

/**
 * Cola de problemas reportados.
 *
 * A diferencia de los pagos, aquí no hay un botón que resuelva el problema: lo
 * resuelve el operador entrando a la plataforma. Lo que hace esta pantalla es
 * darle el contexto que por WhatsApp había que preguntar —qué cuenta, qué
 * perfil, desde cuándo, con capturas— y un botón para cerrarlo cuando ya está.
 */

/**
 * Los dos desenlaces salen del mismo formulario con `name="status"`: el valor
 * del botón pulsado es el que viaja. Anidar un `<button>` dentro de otro sería
 * HTML inválido y el navegador lo desarma por su cuenta.
 */
function BotonesResolucion() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="status" value="resolved" size="sm" disabled={pending}>
        {pending ? (
          'Guardando…'
        ) : (
          <>
            <CheckCheck aria-hidden className="size-4" strokeWidth={2.5} />
            Marcar resuelto
          </>
        )}
      </Button>

      <Button
        type="submit"
        name="status"
        value="rejected"
        variant="ghost"
        size="sm"
        disabled={pending}
      >
        <X aria-hidden className="size-4" strokeWidth={2.5} />
        Descartar
      </Button>
    </div>
  );
}

function Reporte({ report }: { report: AdminReportRow }) {
  const [state, formAction] = useActionState<ActionState, FormData>(resolverReporteAction, {});

  if (state.success) {
    return (
      <Card className="opacity-70">
        <CardContent>
          <p role="status" className="text-sm font-semibold">
            {state.success} · {report.serviceName} de {report.userName ?? report.userEmail}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-white">
              <PlatformIcon iconKey={report.iconKey} name={report.serviceName} className="size-6" />
            </span>

            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                {report.serviceName} · {report.profileLabel}
              </p>
              <p className="truncate text-xs text-[var(--color-content-muted)]">
                {report.userName ? `${report.userName} · ` : ''}
                {report.userEmail}
              </p>
            </div>
          </div>

          <p className="text-xs text-[var(--color-content-muted)]">
            {formatRelativeTime(report.createdAt)}
          </p>
        </div>

        <p className="whitespace-pre-wrap rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2.5 text-sm">
          {report.reason}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Las capturas se abren con URL firmada de diez minutos: el bucket es
              privado y una captura puede llevar el correo de la cuenta. */}
          {report.screenshotUrls.map((url, indice) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary" size="sm">
                <ExternalLink aria-hidden className="size-4" strokeWidth={2.5} />
                Captura {indice + 1}
              </Button>
            </a>
          ))}

          {report.userPhone && (
            <a href={whatsappLink(report.userPhone)} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="ghost" size="sm">
                <MessageCircle aria-hidden className="size-4" strokeWidth={2.5} />
                {report.userPhone}
              </Button>
            </a>
          )}

          <span className="text-xs text-[var(--color-content-muted)]">
            {report.accountLabel} · {formatDateTime(report.createdAt)}
          </span>
        </div>

        {state.error && (
          <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
            {state.error}
          </p>
        )}

        <form
          action={formAction}
          className="flex flex-col gap-2 border-t-2 border-[var(--color-border)] pt-4"
        >
          <input type="hidden" name="reportId" value={report.id} />

          <Label htmlFor={`nota-${report.id}`}>Respuesta (la verá el cliente)</Label>
          <Input
            id={`nota-${report.id}`}
            name="note"
            placeholder="Cambiamos el PIN, prueba de nuevo"
            maxLength={500}
          />

          <BotonesResolucion />
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountReportQueue({ reports }: { reports: AdminReportRow[] }) {
  if (reports.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Inbox aria-hidden className="size-7" strokeWidth={2} />
        <p className="font-[family-name:var(--font-display)] text-base font-black uppercase">
          Ningún problema reportado
        </p>
        <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
          Cuando un cliente reporte que su cuenta falla, aparecerá aquí con sus capturas.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <Reporte key={report.id} report={report} />
      ))}
    </div>
  );
}
