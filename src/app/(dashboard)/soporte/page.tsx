import type { Metadata } from 'next';
import { LifeBuoy } from 'lucide-react';

import { requireUser } from '@/features/auth/session';
import { ReportForm } from '@/features/reports/components/report-form';
import { getReportableAccounts } from '@/features/reports/queries';

export const metadata: Metadata = { title: 'Soporte' };

/**
 * Reportar un problema con una cuenta.
 *
 * Existe para sacar el soporte del WhatsApp. Allí el cliente escribe «no me
 * sirve» y hay que preguntarle cuál de sus perfiles, en qué cuenta y desde
 * cuándo; aquí el desplegable ya trae esa información y las capturas viajan con
 * el reporte.
 */
export default async function SoportePage() {
  await requireUser('/soporte');

  const cuentas = await getReportableAccounts();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <LifeBuoy aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Ayuda
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
          Soporte
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--color-content-muted)]">
          ¿Algo no funciona con tu cuenta? Cuéntanos y lo revisamos.
        </p>
      </header>

      <ReportForm accounts={cuentas} />
    </div>
  );
}
