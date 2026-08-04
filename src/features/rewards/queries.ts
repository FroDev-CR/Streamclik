import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

export interface RewardServiceOption {
  id: string;
  name: string;
  brandColor: string;
}

export interface ProfileRewardRow {
  id: string;
  source: 'referral' | 'admin';
  status: 'available' | 'claimed' | 'cancelled';
  durationDays: number;
  note: string | null;
  claimedServiceName: string | null;
  claimedServiceColor: string | null;
  claimedAt: string | null;
  createdAt: string;
}

export interface MyRewardsData {
  referralCode: string;
  rewards: ProfileRewardRow[];
  services: RewardServiceOption[];
}

export interface RewardsQueryResult {
  data: MyRewardsData;
  error: string | null;
}

/** Código, premios y plataformas reclamables del cliente autenticado. */
export async function getMyRewards(userId: string): Promise<RewardsQueryResult> {
  const supabase = await createSupabaseServerClient();

  const [perfil, premios, servicios] = await Promise.all([
    supabase.from('user_profiles').select('referral_code').eq('id', userId).single(),
    supabase
      .from('profile_rewards')
      .select(
        `id, source, status, duration_days, note, claimed_at, created_at,
         claimed_service:streaming_services!profile_rewards_claimed_service_id_fkey (
           name, brand_color
         )`,
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('streaming_services')
      .select('id, name, brand_color')
      .eq('is_active', true)
      .order('name'),
  ]);

  const error = perfil.error ?? premios.error ?? servicios.error;
  if (error) {
    logger.error('No se pudieron cargar las recompensas', {
      error: error.message,
    });
  }

  type RewardRecord = {
    id: string;
    source: 'referral' | 'admin';
    status: 'available' | 'claimed' | 'cancelled';
    duration_days: number;
    note: string | null;
    claimed_at: string | null;
    created_at: string;
    claimed_service: { name: string; brand_color: string } | null;
  };

  return {
    data: {
      referralCode: perfil.data?.referral_code ?? '',
      rewards: ((premios.data ?? []) as unknown as RewardRecord[]).map((reward) => ({
        id: reward.id,
        source: reward.source,
        status: reward.status,
        durationDays: reward.duration_days,
        note: reward.note,
        claimedServiceName: reward.claimed_service?.name ?? null,
        claimedServiceColor: reward.claimed_service?.brand_color ?? null,
        claimedAt: reward.claimed_at,
        createdAt: reward.created_at,
      })),
      services: (servicios.data ?? []).map((service) => ({
        id: service.id,
        name: service.name,
        brandColor: service.brand_color,
      })),
    },
    error: error?.message ?? null,
  };
}
