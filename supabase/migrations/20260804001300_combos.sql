-- =============================================================================
-- 0013 · Combos de plataformas
-- =============================================================================
-- Un combo es un producto formado por dos o más servicios. El precio se congela
-- en el pedido igual que en una compra individual, y la entrega reserva todos
-- los perfiles antes de crear ninguna asignación para evitar entregas parciales.

create table public.streaming_combos (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name           text not null check (char_length(trim(name)) between 2 and 80),
  tagline        text,
  price_amount   numeric(10, 2) not null check (price_amount >= 0),
  price_currency text not null default 'CRC',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.streaming_combo_items (
  combo_id   uuid not null references public.streaming_combos (id) on delete cascade,
  service_id uuid not null references public.streaming_services (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (combo_id, service_id)
);

create index streaming_combo_items_service_idx
  on public.streaming_combo_items (service_id);

create trigger streaming_combos_set_updated_at
  before update on public.streaming_combos
  for each row execute function public.set_updated_at();

alter table public.streaming_combos enable row level security;
alter table public.streaming_combo_items enable row level security;

create policy "combos activos visibles públicamente"
  on public.streaming_combos for select to anon
  using (is_active);

create policy "combos legibles por usuarios autenticados"
  on public.streaming_combos for select to authenticated
  using (true);

create policy "administradores gestionan combos"
  on public.streaming_combos for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "servicios de combos activos visibles públicamente"
  on public.streaming_combo_items for select to anon
  using (
    exists (
      select 1
        from public.streaming_combos combo
       where combo.id = combo_id
         and combo.is_active
    )
  );

create policy "servicios de combos legibles por usuarios autenticados"
  on public.streaming_combo_items for select to authenticated
  using (true);

create policy "administradores gestionan servicios de combos"
  on public.streaming_combo_items for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Un pedido apunta exactamente a un producto: una plataforma o un combo.
alter table public.orders
  alter column service_id drop not null,
  add column combo_id uuid references public.streaming_combos (id) on delete restrict,
  add constraint orders_exactly_one_product check (num_nonnulls(service_id, combo_id) = 1);

create index orders_combo_idx on public.orders (combo_id);

-- Un pedido individual produce una asignación; un combo produce varias. Se
-- conserva orders.assignment_id como acceso rápido y compatibilidad histórica,
-- mientras esta tabla registra la entrega completa.
create table public.order_assignments (
  order_id      uuid not null references public.orders (id) on delete cascade,
  assignment_id uuid not null references public.profile_assignments (id) on delete restrict,
  created_at    timestamptz not null default now(),
  primary key (order_id, assignment_id),
  unique (assignment_id)
);

insert into public.order_assignments (order_id, assignment_id)
select id, assignment_id
  from public.orders
 where assignment_id is not null
on conflict do nothing;

alter table public.order_assignments enable row level security;

create policy "clientes ven las entregas de sus pedidos"
  on public.order_assignments for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.orders pedido
       where pedido.id = order_id
         and pedido.user_id = public.current_user_id()
    )
  );

create policy "administradores gestionan entregas de pedidos"
  on public.order_assignments for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Escaparate público de combos. La disponibilidad real de un paquete es la del
-- servicio con menos perfiles libres: no se vende un combo que no pueda
-- entregarse completo.
create or replace function public.combos_publicos()
returns table (
  slug        text,
  nombre      text,
  lema        text,
  precio      numeric,
  moneda      text,
  disponibles bigint,
  servicios   jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with stock_por_servicio as (
    select
      s.id as service_id,
      count(ap.id) filter (
        where not exists (
          select 1
            from public.profile_assignments pa
           where pa.account_profile_id = ap.id
             and pa.status = 'active'
             and pa.starts_at <= now()
             and (pa.expires_at is null or pa.expires_at > now())
        )
      )::bigint as disponibles
    from public.streaming_services s
    left join public.streaming_accounts acc
      on acc.service_id = s.id and acc.status = 'active'
    left join public.account_profiles ap on ap.account_id = acc.id
    group by s.id
  )
  select
    combo.slug,
    combo.name,
    combo.tagline,
    combo.price_amount,
    combo.price_currency,
    min(coalesce(stock.disponibles, 0))::bigint,
    jsonb_agg(
      jsonb_build_object(
        'slug', servicio.slug,
        'nombre', servicio.name,
        'color', servicio.brand_color
      )
      order by servicio.name
    )
  from public.streaming_combos combo
  join public.streaming_combo_items item on item.combo_id = combo.id
  join public.streaming_services servicio on servicio.id = item.service_id
  left join stock_por_servicio stock on stock.service_id = servicio.id
  where combo.is_active and servicio.is_active
  group by combo.id
  having count(*) >= 2
  order by combo.name;
$$;

grant execute on function public.combos_publicos() to anon, authenticated;

-- Entrega individual o combo, siempre atómica. En el caso del combo primero se
-- bloquea un perfil de cada servicio y sólo después se crean las asignaciones.
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

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'order.delivered',
    'order',
    p_order_id,
    jsonb_build_object('assignment_ids', to_jsonb(v_assignments), 'user_id', v_order.user_id)
  );

  return jsonb_build_object(
    'status', 'entregado',
    'assignment_id', v_assignments[1],
    'assignment_ids', to_jsonb(v_assignments)
  );
end;
$$;

revoke execute on function public.soltar_cuenta(uuid, timestamptz) from public, anon;
grant execute on function public.soltar_cuenta(uuid, timestamptz) to authenticated;
