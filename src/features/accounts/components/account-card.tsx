import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';

import type { AssignedAccount } from '../queries';

/**
 * Tarjeta resumen de una cuenta asignada, para la rejilla del dashboard.
 *
 * Server Component: sólo enlaza al detalle, no necesita interactividad.
 */
export function AccountCard({ account }: { account: AssignedAccount }) {
  const expiresSoon =
    account.expiresAt !== null &&
    new Date(account.expiresAt).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;

  return (
    <Link href={`/cuenta/${account.accountId}`} className="group block">
      <Card className="flex items-center gap-4 p-4 transition-colors group-hover:border-[--color-border-strong]">
        {/* Marca del servicio como franja de color: identifica Netflix frente a
            Disney+ de un vistazo cuando el cliente tenga varias cuentas. */}
        <span
          aria-hidden
          className="h-10 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: account.brandColor }}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-[--color-content]">
              {account.serviceName}
            </span>
            <Badge tone="neutral">{account.profileLabel}</Badge>
            {expiresSoon && <Badge tone="warning">Por vencer</Badge>}
          </div>

          <span className="truncate text-xs text-[--color-content-subtle]">
            {account.expiresAt
              ? `Acceso hasta el ${formatDateTime(account.expiresAt)}`
              : 'Acceso sin fecha de vencimiento'}
          </span>
        </div>

        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-[--color-content-subtle] transition-transform group-hover:translate-x-0.5"
        />
      </Card>
    </Link>
  );
}
