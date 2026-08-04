import type { Metadata } from 'next';
import { AlertTriangle, Inbox } from 'lucide-react';

import { InboxMonitor } from '@/features/admin/components/inbox-monitor';
import { getRecentInboundEmails } from '@/features/admin/queries';
import { requireAdmin } from '@/features/auth/session';

export const metadata: Metadata = { title: 'Buzón' };

/** Bandeja exclusiva del operador para revisar todos los correos recibidos. */
export default async function BuzonPage() {
  await requireAdmin();

  const correos = await getRecentInboundEmails(50);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Inbox aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Panel de operación
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-6xl">
          Buzón
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          Revisa todo lo que llega a tus direcciones de StreamClick, tenga código o no.
        </p>
      </header>

      {correos.error && (
        <div
          role="alert"
          className="rounded-2xl border-[3px] border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4 shadow-[5px_5px_0_var(--color-danger)]"
        >
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.5} />
            No se pudieron cargar los correos
          </p>
          <p className="mt-2 font-mono text-xs">{correos.error}</p>
        </div>
      )}

      <InboxMonitor emails={correos.data} />
    </div>
  );
}
