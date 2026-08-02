import { PIN_TYPE_LABELS, isPinExpired, type VerificationPin } from '@/core/domain/entities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Historial de códigos recibidos.
 *
 * Server Component: es contenido estático de solo lectura, así que no hay motivo
 * para enviar JavaScript al navegador ni para pedir los datos desde el cliente.
 */
export function PinHistory({ pins }: { pins: VerificationPin[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de códigos</CardTitle>
      </CardHeader>

      <CardContent>
        {pins.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-content-muted)]">
            Todavía no se ha recibido ningún código
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {pins.map((pin) => {
              const expired = isPinExpired(pin);

              return (
                <li key={pin.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span
                      className={cn(
                        'pin-display text-lg',
                        expired
                          ? 'text-[var(--color-content-subtle)]'
                          : 'text-[var(--color-content)]',
                      )}
                    >
                      {pin.code}
                    </span>
                    <Badge tone="neutral" className="w-fit">
                      {PIN_TYPE_LABELS[pin.codeType]}
                    </Badge>
                  </div>

                  {/* `<time>` con `dateTime` legible por máquinas: útil para
                      lectores de pantalla y para copiar la marca temporal exacta
                      en una incidencia. */}
                  <time
                    dateTime={pin.receivedAt}
                    className="shrink-0 text-xs text-[var(--color-content-subtle)]"
                  >
                    {formatDateTime(pin.receivedAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
