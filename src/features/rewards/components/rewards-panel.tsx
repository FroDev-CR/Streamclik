'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, Gift, Sparkles, TicketCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime } from '@/lib/utils';

import { reclamarRecompensaAction } from '../actions';
import type { ProfileRewardRow, RewardServiceOption } from '../queries';

function ClaimButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
      {pending ? 'Activando…' : 'Reclamar perfil'}
    </Button>
  );
}

function AvailableReward({
  reward,
  services,
}: {
  reward: ProfileRewardRow;
  services: RewardServiceOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(reclamarRecompensaAction, {});

  return (
    <li className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] p-4 shadow-[4px_4px_0_var(--color-border)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="success">Disponible</Badge>
          <p className="mt-2 font-[family-name:var(--font-display)] text-lg font-black uppercase">
            Un perfil por {reward.durationDays} días
          </p>
          <p className="mt-1 text-xs text-[var(--color-content-muted)]">
            {reward.note ?? 'Elige la plataforma que quieres activar.'}
          </p>
        </div>
        <Gift aria-hidden className="size-7" strokeWidth={2.5} />
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="rewardId" value={reward.id} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor={`reward-service-${reward.id}`}>Plataforma</Label>
          <Select id={`reward-service-${reward.id}`} name="serviceId" defaultValue="" required>
            <option value="" disabled>
              Elegir plataforma…
            </option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </div>
        <ClaimButton />
      </form>

      {state.error && (
        <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{state.error}</p>
      )}
      {state.success && (
        <p className="mt-2 text-xs font-semibold text-[var(--color-success)]">{state.success}</p>
      )}
    </li>
  );
}

export function RewardsPanel({
  referralCode,
  rewards,
  services,
}: {
  referralCode: string;
  rewards: ProfileRewardRow[];
  services: RewardServiceOption[];
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
            Compártelo. Cuando otra persona lo use y aprobemos su compra, recibirás un perfil
            gratis.
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
              Comparte tu código para ganar tu primer perfil.
            </p>
          </Card>
        ) : (
          <ul className="mt-4 grid gap-4">
            {disponibles.map((reward) => (
              <AvailableReward key={reward.id} reward={reward} services={services} />
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
                  <p className="font-semibold">{reward.claimedServiceName ?? 'Perfil reclamado'}</p>
                  <p className="text-xs text-[var(--color-content-muted)]">
                    {reward.durationDays} días ·{' '}
                    {reward.claimedAt ? formatDateTime(reward.claimedAt) : 'reclamada'}
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
