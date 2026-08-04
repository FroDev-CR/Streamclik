-- =============================================================================
-- 0014 · Códigos de invitación y recompensas de perfiles
-- =============================================================================
-- La recompensa no nace al escribir un código ni al subir un comprobante. Se
-- crea dentro de `soltar_cuenta`, en la misma transacción que aprueba el pago y
-- entrega la compra. Así un comprobante rechazado nunca genera un premio.

-- -----------------------------------------------------------------------------
-- 1 · Código único por cliente
-- -----------------------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  loop
    v_code := 'SC-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.user_profiles where referral_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

revoke execute on function public.generate_referral_code() from public, anon, authenticated;

alter table public.user_profiles
  add column if not exists referral_code text;

update public.user_profiles
   set referral_code = public.generate_referral_code()
 where referral_code is null;

alter table public.user_profiles
  alter column referral_code set default public.generate_referral_code(),
  alter column referral_code set not null,
  add constraint user_profiles_referral_code_format
    check (referral_code ~ '^SC-[A-F0-9]{8}$'),
  add constraint user_profiles_referral_code_key unique (referral_code);

comment on column public.user_profiles.referral_code is
  'Código público y único que otro cliente puede usar al comprar. Nunca identifica por sí solo una sesión.';

create or replace function public.keep_referral_code_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.referral_code is distinct from new.referral_code then
    raise exception 'El código de invitación no puede cambiar';
  end if;
  return new;
end;
$$;

create trigger user_profiles_keep_referral_code_immutable
  before update on public.user_profiles
  for each row execute function public.keep_referral_code_immutable();

-- -----------------------------------------------------------------------------
-- 2 · Referido congelado en el pedido
-- -----------------------------------------------------------------------------
alter table public.orders
  add column referrer_user_id uuid references public.user_profiles (id) on delete set null,
  add column referral_code_used text,
  add constraint orders_referrer_is_another_user
    check (referrer_user_id is null or referrer_user_id <> user_id),
  add constraint orders_referral_pair
    check ((referrer_user_id is null) = (referral_code_used is null));

create index orders_referrer_idx
  on public.orders (referrer_user_id, created_at desc)
  where referrer_user_id is not null;

-- Garantía de base de datos: aunque alguien ignore la interfaz y llame a
-- PostgREST directamente, el uuid y el texto tienen que pertenecer al mismo
-- cliente real.
create or replace function public.validate_order_referral()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.referrer_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_profiles
     where id = new.referrer_user_id
       and referral_code = new.referral_code_used
       and role = 'client'
  ) then
    raise exception 'Código de invitación inválido';
  end if;

  return new;
end;
$$;

create trigger orders_validate_referral
  before insert on public.orders
  for each row execute function public.validate_order_referral();

-- El cliente puede reemplazar un comprobante mientras espera. Eso no le da
-- permiso para cambiar el referido después de crear el pedido.
create or replace function public.keep_order_referral_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.referrer_user_id is distinct from new.referrer_user_id
     or old.referral_code_used is distinct from new.referral_code_used then
    raise exception 'El código de invitación de un pedido no puede cambiar';
  end if;

  return new;
end;
$$;

create trigger orders_keep_referral_immutable
  before update on public.orders
  for each row execute function public.keep_order_referral_immutable();

-- Resuelve el código sin exponer la lista de usuarios. La aplicación sólo
-- recibe el uuid que debe congelar en el pedido o un estado entendible.
create or replace function public.resolve_referral_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_owner public.user_profiles%rowtype;
  v_code text;
begin
  v_current := public.current_user_id();
  v_code := upper(trim(coalesce(p_code, '')));

  if v_current is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;

  if v_code = '' then
    return jsonb_build_object('status', 'sin_codigo');
  end if;

  select * into v_owner
    from public.user_profiles
   where referral_code = v_code
     and role = 'client';

  if not found then
    return jsonb_build_object('status', 'invalido');
  end if;

  if v_owner.id = v_current then
    return jsonb_build_object('status', 'codigo_propio');
  end if;

  return jsonb_build_object(
    'status', 'valido',
    'user_id', v_owner.id,
    'code', v_owner.referral_code
  );
end;
$$;

revoke execute on function public.resolve_referral_code(text) from public, anon;
grant execute on function public.resolve_referral_code(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Recompensas
-- -----------------------------------------------------------------------------
create table public.profile_rewards (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.user_profiles (id) on delete cascade,
  source                text not null check (source in ('referral', 'admin')),
  status                text not null default 'available'
                          check (status in ('available', 'claimed', 'cancelled')),
  duration_days         integer not null default 30 check (duration_days between 1 and 365),
  note                  text check (note is null or char_length(note) <= 280),
  referral_order_id     uuid unique references public.orders (id) on delete set null,
  created_by            uuid references public.user_profiles (id) on delete set null,
  claimed_service_id    uuid references public.streaming_services (id) on delete set null,
  claimed_assignment_id uuid unique references public.profile_assignments (id) on delete set null,
  claimed_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint profile_rewards_claim_state check (
    (status = 'claimed' and claimed_service_id is not null and claimed_at is not null)
    or (status <> 'claimed' and claimed_assignment_id is null and claimed_at is null)
  ),
  constraint referral_reward_has_order check (
    source <> 'referral' or referral_order_id is not null
  )
);

create index profile_rewards_user_idx
  on public.profile_rewards (user_id, status, created_at desc);

create trigger profile_rewards_set_updated_at
  before update on public.profile_rewards
  for each row execute function public.set_updated_at();

alter table public.profile_rewards enable row level security;

create policy "clientes ven sus recompensas"
  on public.profile_rewards for select to authenticated
  using (user_id = public.current_user_id() or public.is_admin());

create policy "administradores crean recompensas"
  on public.profile_rewards for insert to authenticated
  with check (public.is_admin());

create policy "administradores gestionan recompensas"
  on public.profile_rewards for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4 · La aprobación de una compra crea la recompensa automáticamente
-- -----------------------------------------------------------------------------
create or replace function public.soltar_cuenta(
  p_order_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin         uuid;
  v_order         public.orders%rowtype;
  v_service_id    uuid;
  v_profile_id    uuid;
  v_profile_ids   uuid[] := '{}';
  v_assignment    uuid;
  v_assignments   uuid[] := '{}';
  v_reward        uuid;
begin
  v_admin := public.current_user_id();

  if not public.is_admin(v_admin) then
    raise exception 'Sólo un administrador puede soltar una cuenta'
      using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('status', 'no_encontrado');
  end if;

  if v_order.status = 'entregado' then
    return jsonb_build_object('status', 'ya_entregado', 'assignment_id', v_order.assignment_id);
  end if;

  for v_service_id in
    select service_id
      from (
        select v_order.service_id as service_id
         where v_order.service_id is not null
        union all
        select item.service_id
          from public.streaming_combo_items item
         where item.combo_id = v_order.combo_id
      ) productos
  loop
    v_profile_id := null;

    select ap.id
      into v_profile_id
      from public.account_profiles ap
      join public.streaming_accounts acc on acc.id = ap.account_id
     where acc.service_id = v_service_id
       and acc.status = 'active'
       and not exists (
         select 1
           from public.profile_assignments pa
          where pa.account_profile_id = ap.id
            and pa.status = 'active'
            and pa.starts_at <= now()
            and (pa.expires_at is null or pa.expires_at > now())
       )
     order by acc.created_at, ap.slot_index
     limit 1
       for update of ap skip locked;

    if v_profile_id is null then
      return jsonb_build_object('status', 'sin_cupos');
    end if;

    v_profile_ids := array_append(v_profile_ids, v_profile_id);
  end loop;

  if coalesce(array_length(v_profile_ids, 1), 0) = 0 then
    return jsonb_build_object('status', 'sin_cupos');
  end if;

  foreach v_profile_id in array v_profile_ids
  loop
    insert into public.profile_assignments (account_profile_id, user_id, assigned_by, expires_at)
    values (v_profile_id, v_order.user_id, v_admin, p_expires_at)
    returning id into v_assignment;

    v_assignments := array_append(v_assignments, v_assignment);
    insert into public.order_assignments (order_id, assignment_id)
    values (p_order_id, v_assignment);
  end loop;

  update public.orders
     set status = 'entregado',
         assignment_id = v_assignments[1],
         reviewed_at = now(),
         reviewed_by = v_admin
   where id = p_order_id;

  -- El UNIQUE de referral_order_id hace la aprobación idempotente: un doble
  -- clic o un reintento no puede regalar dos perfiles por la misma compra.
  if v_order.referrer_user_id is not null then
    insert into public.profile_rewards (
      user_id, source, status, duration_days, note, referral_order_id
    )
    values (
      v_order.referrer_user_id,
      'referral',
      'available',
      30,
      'Perfil gratis por una compra recomendada y aprobada.',
      p_order_id
    )
    on conflict (referral_order_id) do nothing
    returning id into v_reward;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'order.delivered',
    'order',
    p_order_id,
    jsonb_build_object(
      'assignment_ids', to_jsonb(v_assignments),
      'user_id', v_order.user_id,
      'referral_reward_id', v_reward
    )
  );

  return jsonb_build_object(
    'status', 'entregado',
    'assignment_id', v_assignments[1],
    'assignment_ids', to_jsonb(v_assignments),
    'referral_reward_id', v_reward
  );
end;
$$;

revoke execute on function public.soltar_cuenta(uuid, timestamptz) from public, anon;
grant execute on function public.soltar_cuenta(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 5 · El cliente reclama su perfil cuando quiera
-- -----------------------------------------------------------------------------
create or replace function public.reclamar_recompensa(
  p_reward_id uuid,
  p_service_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_reward public.profile_rewards%rowtype;
  v_profile_id uuid;
  v_assignment_id uuid;
  v_service_name text;
begin
  v_user := public.current_user_id();

  if v_user is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;

  select * into v_reward
    from public.profile_rewards
   where id = p_reward_id
     and user_id = v_user
   for update;

  if not found then
    return jsonb_build_object('status', 'no_encontrada');
  end if;

  if v_reward.status = 'claimed' then
    return jsonb_build_object('status', 'ya_reclamada');
  end if;

  if v_reward.status <> 'available' then
    return jsonb_build_object('status', 'no_disponible');
  end if;

  select name into v_service_name
    from public.streaming_services
   where id = p_service_id
     and is_active;

  if not found then
    return jsonb_build_object('status', 'servicio_no_disponible');
  end if;

  select ap.id
    into v_profile_id
    from public.account_profiles ap
    join public.streaming_accounts acc on acc.id = ap.account_id
   where acc.service_id = p_service_id
     and acc.status = 'active'
     and not exists (
       select 1
         from public.profile_assignments pa
        where pa.account_profile_id = ap.id
          and pa.status = 'active'
     )
   order by acc.created_at, ap.slot_index
   limit 1
     for update of ap skip locked;

  if v_profile_id is null then
    return jsonb_build_object('status', 'sin_cupos');
  end if;

  insert into public.profile_assignments (
    account_profile_id, user_id, assigned_by, expires_at
  )
  values (
    v_profile_id,
    v_user,
    null,
    now() + make_interval(days => v_reward.duration_days)
  )
  returning id into v_assignment_id;

  update public.profile_rewards
     set status = 'claimed',
         claimed_service_id = p_service_id,
         claimed_assignment_id = v_assignment_id,
         claimed_at = now()
   where id = p_reward_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_user,
    'reward.claimed',
    'profile_reward',
    p_reward_id,
    jsonb_build_object(
      'service_id', p_service_id,
      'assignment_id', v_assignment_id,
      'duration_days', v_reward.duration_days
    )
  );

  return jsonb_build_object(
    'status', 'reclamada',
    'assignment_id', v_assignment_id,
    'service_name', v_service_name,
    'duration_days', v_reward.duration_days
  );
end;
$$;

revoke execute on function public.reclamar_recompensa(uuid, uuid) from public, anon;
grant execute on function public.reclamar_recompensa(uuid, uuid) to authenticated;
