import { CheckCircle2, CircleSlash, MailQuestion, XCircle } from 'lucide-react';

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
  { etiqueta: string; tono: 'success' | 'neutral' | 'danger' | 'warning'; icono: typeof CheckCircle2 }
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

              return (
                <li key={email.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
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
                    <Badge tone={estado.tono}>{estado.etiqueta}</Badge>
                    <time
                      dateTime={email.receivedAt}
                      className="text-xs text-[var(--color-content-subtle)]"
                    >
                      {formatRelativeTime(email.receivedAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 border-t-2 border-[var(--color-border)] pt-3 text-xs text-[var(--color-content-muted)]">
          <strong>«Buzón desconocido»</strong> significa que ninguna cuenta usa esa dirección:
          revisa que el correo de ingesta coincida exactamente.
        </p>
      </CardContent>
    </Card>
  );
}
