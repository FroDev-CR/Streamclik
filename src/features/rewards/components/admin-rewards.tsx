'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Gift, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';
import { formatDateTime } from '@/lib/utils';

import { crearRecompensaAdminAction } from '../actions';

export interface AdminRewardSummary {
  id: string;
  status: 'available' | 'claimed' | 'cancelled';
  source: 'referral' | 'admin';
  durationDays: number;
  note: string | null;
  serviceName: string | null;
  createdAt: string;
}

function SubmitReward() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Plus aria-hidden className="size-4" strokeWidth={3} />
      {pending ? 'Creando…' : 'Crear recompensa'}
    </Button>
  );
}

export function AdminRewards({
  userId,
  rewards,
}: {
  userId: string;
  rewards: AdminRewardSummary[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(crearRecompensaAdminAction, {});
  const disponibles = rewards.filter((reward) => reward.status === 'available').length;

  return (
    <div className="mt-4 border-t-2 border-[var(--color-border)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-black uppercase">
          <Gift aria-hidden className="size-4" strokeWidth={2.5} />
          Recompensas
        </p>
        <Badge tone={disponibles > 0 ? 'success' : 'neutral'}>{disponibles} por reclamar</Badge>
      </div>

      {rewards.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {rewards.map((reward) => (
            <li
              key={reward.id}
              className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] p-3 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {reward.status === 'claimed'
                    ? (reward.serviceName ?? 'Perfil reclamado')
                    : "₡1000 de rebajo"}
                </span>
                <Badge tone={reward.status === 'available' ? 'success' : 'neutral'}>
                  {reward.status === 'available'
                    ? 'Disponible'
                    : reward.status === 'claimed'
                      ? 'Usada'
                      : 'Cancelada'}
                </Badge>
              </div>
              <p className="mt-1 text-[var(--color-content-muted)]">
                {reward.source === 'referral' ? 'Por referido' : 'Creada por admin'} ·{' '}
                {formatDateTime(reward.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        action={formAction}
        className="mt-3 grid gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] p-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="userId" value={userId} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`reward-days-${userId}`}>Días</Label>
          <Input
            id={`reward-days-${userId}`}
            name="durationDays"
            type="number"
            min={1}
            max={365}
            defaultValue={30}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`reward-note-${userId}`}>Motivo (opcional)</Label>
          <Input
            id={`reward-note-${userId}`}
            name="note"
            maxLength={280}
            placeholder="Premio especial"
          />
        </div>
        <SubmitReward />
      </form>

      {state.error && (
        <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{state.error}</p>
      )}
      {state.success && (
        <p className="mt-2 text-xs font-semibold text-[var(--color-success)]">{state.success}</p>
      )}
    </div>
  );
}
