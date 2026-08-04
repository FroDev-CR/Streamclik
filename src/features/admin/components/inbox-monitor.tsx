import { CheckCircle2, ChevronDown, CircleSlash, Eye, MailQuestion, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils';

import type { InboundEmailRow } from '../queries';

/**
 * Últimos correos recibidos en los buzones de ingesta.
 *
 * Server Component: es una lista de sólo lectura y no necesita JavaScript.
 *
 * Existe por un caso muy concreto y muy frecuente al montar una cuenta: cuando
 * cambias la dirección de Netflix a un buzón de StreamClick, Netflix envía un
 * **enlace** de confirmación, no un código. El parser lo marca como `unmatched`
 * —correctamente, porque no hay ningún número que extraer— y ese correo no
 * aparece en ninguna otra pantalla. Sin esta vista se recibe bien y se pierde de
 * vista, y el operador cree que el correo no llegó.
 */

const ESTADOS: Record<
  InboundEmailRow['parseStatus'],
  {
    etiqueta: string;
    tono: 'success' | 'neutral' | 'danger' | 'warning';
    icono: typeof CheckCircle2;
  }
> = {
  parsed: { etiqueta: 'Código extraído', tono: 'success', icono: CheckCircle2 },
  unmatched: { etiqueta: 'Sin código', tono: 'neutral', icono: MailQuestion },
  failed: { etiqueta: 'Error al leer', tono: 'danger', icono: XCircle },
  ignored: { etiqueta: 'Buzón desconocido', tono: 'warning', icono: CircleSlash },
};

export function InboxMonitor({ emails }: { emails: InboundEmailRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Correos recibidos</CardTitle>
        <p className="text-sm text-[var(--color-content-muted)]">
          Todo lo que llega a tus buzones, tenga código o no.
        </p>
      </CardHeader>

      <CardContent>
        {emails.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-content-muted)]">
            Todavía no ha llegado ningún correo. Si ya configuraste el catch-all en Cloudflare,
            prueba a enviarte uno a un buzón de ingesta.
          </p>
        ) : (
          <ul className="divide-y-2 divide-[var(--color-border)]">
            {emails.map((email) => {
              const estado = ESTADOS[email.parseStatus];
              const Icono = estado.icono;
              const etiquetaEstado =
                email.parseStatus === 'ignored' && email.serviceName
                  ? 'Sin cuenta asociada'
                  : estado.etiqueta;

              return (
                <li key={email.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3 py-3 outline-none first:pt-0 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {email.subject || '(sin asunto)'}
                        </p>
                        <p className="truncate font-mono text-xs text-[var(--color-content-muted)]">
                          {email.fromAddress} → {email.toAddress}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          {email.serviceName && <Badge tone="accent">{email.serviceName}</Badge>}
                          <Badge tone={estado.tono}>{etiquetaEstado}</Badge>
                          <ChevronDown
                            aria-hidden
                            className="size-4 transition-transform group-open:rotate-180"
                            strokeWidth={2.5}
                          />
                        </div>
                        <time
                          dateTime={email.receivedAt}
                          className="text-xs text-[var(--color-content-subtle)]"
                        >
                          {formatRelativeTime(email.receivedAt)}
                        </time>
                      </div>
                    </summary>

                    <div className="mb-3 ml-7 overflow-hidden rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)]">
                      <div className="grid gap-3 border-b-2 border-[var(--color-border)] p-4 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="font-[family-name:var(--font-display)] font-extrabold uppercase tracking-wider text-[var(--color-content-subtle)]">
                            Remitente
                          </p>
                          <p className="mt-1 break-all font-mono">{email.fromAddress}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="font-[family-name:var(--font-display)] font-extrabold uppercase tracking-wider text-[var(--color-content-subtle)]">
                            Buzón de llegada
                          </p>
                          <p className="mt-1 break-all font-mono">{email.toAddress}</p>
                        </div>
                      </div>

                      {!email.accountId && email.serviceName && (
                        <p className="border-b-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-4 py-3 text-xs font-semibold">
                          Identificado como {email.serviceName}, pero ninguna cuenta del banco usa{' '}
                          <span className="font-mono">{email.toAddress}</span>. Añádela con ese
                          buzón para que el código llegue automáticamente a sus perfiles.
                        </p>
                      )}

                      <div className="p-4">
                        <p className="mb-3 flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-wider">
                          <Eye aria-hidden className="size-4" strokeWidth={2.5} />
                          Cuerpo completo del correo
                        </p>

                        {email.body ? (
                          <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-sans text-sm leading-relaxed">
                            {email.body}
                          </pre>
                        ) : (
                          <p className="text-sm text-[var(--color-content-muted)]">
                            Este correo no incluía contenido de texto.
                          </p>
                        )}

                        {email.parseError && (
                          <p className="mt-3 rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 font-mono text-xs text-[var(--color-danger)]">
                            Error del parser: {email.parseError}
                          </p>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 border-t-2 border-[var(--color-border)] pt-3 text-xs text-[var(--color-content-muted)]">
          <strong>«Sin cuenta asociada»</strong> significa que reconocimos la plataforma, pero
          ninguna cuenta usa ese buzón. <strong>«Buzón desconocido»</strong> significa que tampoco
          reconocimos al remitente.
        </p>
      </CardContent>
    </Card>
  );
}
