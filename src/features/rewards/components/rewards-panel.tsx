'use client';

import { useState } from 'react';
import { Check, Copy, Gift, TicketCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';

import type { ProfileRewardRow } from '../queries';

/**
 * Una recompensa disponible.
 *
 * Ya no hay nada que pulsar: el rebajo lo aplican los triggers de `orders` en
 * cuanto el cliente crea su próxima compra o renovación. Antes había que elegir
 * plataforma y reclamar un perfil gratis; ese paso desapareció con el cambio a
 * ₡1000, y quitarlo es parte del cambio —un botón que ya no hace nada es peor
 * que ninguno.
 */
function AvailableReward({ reward }: { reward: ProfileRewardRow }) {
  return (
    <li className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] p-4 shadow-[4px_4px_0_var(--color-border)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="success">Disponible</Badge>
          <p className="mt-2 font-[family-name:var(--font-display)] text-lg font-black uppercase">
            ₡1000 de rebajo
          </p>
          <p className="mt-1 text-xs text-[var(--color-content-muted)]">
            {reward.note ?? 'Se aplica solo en tu próxima compra o renovación.'}
          </p>
        </div>
        <Gift aria-hidden className="size-7" strokeWidth={2.5} />
      </div>
    </li>
  );
}

export function RewardsPanel({
  referralCode,
  rewards,
}: {
  referralCode: string;
  rewards: ProfileRewardRow[];
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // El código permanece visible para poder seleccionarlo manualmente.
    }
  }

  const disponibles = rewards.filter((reward) => reward.status === 'available');
  const reclamadas = rewards.filter((reward) => reward.status === 'claimed');

  return (
    <section id="recompensas" className="scroll-mt-28 space-y-5">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Código de invitación</CardTitle>
          <p className="text-sm text-[var(--color-content-muted)]">
            Compártelo. Cuando otra persona lo use y aprobemos su compra, recibirás ₡1000 de
            rebajo en tu próxima compra o renovación.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] border-[var(--color-border)] bg-[var(--color-brand-yellow)] p-4 shadow-[5px_5px_0_var(--color-border)]">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--color-content-muted)]">
                Tu código
              </p>
              <p className="font-mono text-2xl font-black tracking-wider">
                {referralCode || 'Generando…'}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={copyCode} disabled={!referralCode}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? 'Copiado' : 'Copiar código'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-content-muted)]">
            No puedes usar tu propio código. El premio se acredita únicamente cuando la compra
            referida es aprobada.
          </p>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
              <Gift aria-hidden className="size-4" strokeWidth={2.5} />
              Tus premios
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-[0.9] tracking-[-0.045em]">
              Recompensas
            </h2>
          </div>
          <Badge tone={disponibles.length > 0 ? 'success' : 'neutral'}>
            {disponibles.length} disponibles
          </Badge>
        </div>

        {rewards.length === 0 ? (
          <Card className="mt-4 flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Gift aria-hidden className="size-8" strokeWidth={2} />
            <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase">
              Aún no tienes recompensas
            </p>
            <p className="max-w-sm text-sm text-[var(--color-content-muted)]">
              Comparte tu código y gana ₡1000 de rebajo por cada persona que compre.
            </p>
          </Card>
        ) : (
          <ul className="mt-4 grid gap-4">
            {disponibles.map((reward) => (
              <AvailableReward key={reward.id} reward={reward} />
            ))}
            {reclamadas.map((reward) => (
              <li
                key={reward.id}
                className="flex items-center gap-3 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] text-white"
                  style={{
                    backgroundColor: reward.claimedServiceColor ?? '#666666',
                  }}
                >
                  <TicketCheck className="size-5" strokeWidth={2.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">₡1000 de rebajo</p>
                  <p className="text-xs text-[var(--color-content-muted)]">
                    Aplicado{' '}
                    {reward.claimedAt ? `el ${formatDateTime(reward.claimedAt)}` : 'en una compra'}
                  </p>
                </div>
                <Badge tone="neutral">Usada</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
