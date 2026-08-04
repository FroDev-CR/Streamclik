-- 0017 · Cantidades de perfiles por aplicación dentro de un combo
--
-- Un combo puede incluir, por ejemplo, dos perfiles de Netflix sin duplicar
-- filas ni plataformas. La cantidad también participa en el cálculo de stock
-- y en la entrega, que sigue siendo atómica.

alter table public.streaming_combo_items
  add column quantity smallint not null default 1,
  add constraint streaming_combo_items_quantity_range
    check (quantity between 1 and 10);

drop function if exists public.combos_publicos();

create function public.combos_publicos()
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
    min(coalesce(stock.disponibles, 0) / item.quantity)::bigint,
    jsonb_agg(
      jsonb_build_object(
        'slug', servicio.slug,
        'nombre', servicio.name,
        'color', servicio.brand_color,
        'icono', servicio.icon_key,
        'cantidad', item.quantity
      )
      order by servicio.name
    )
  from public.streaming_combos combo
  join public.streaming_combo_items item on item.combo_id = combo.id
  join public.streaming_services servicio on servicio.id = item.service_id
  left join stock_por_servicio stock on stock.service_id = servicio.id
  where combo.is_active and servicio.is_active
  group by combo.id
  having sum(item.quantity) >= 2
  order by combo.name;
$$;

grant execute on function public.combos_publicos() to anon, authenticated;

-- Expande cada elemento del combo tantas veces como perfiles incluya. Primero
-- bloquea todos los slots necesarios; si falta uno, no entrega ninguno.
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
        -- Pedido individual histórico.
        select v_order.service_id as service_id
         where v_order.service_id is not null

        union all

        -- Combo histórico, respetando cuántos perfiles pide de cada app.
        select combo_item.service_id
          from public.streaming_combo_items combo_item
          cross join lateral generate_series(1, combo_item.quantity)
         where combo_item.combo_id = v_order.combo_id

        union all

        -- Plataformas del carrito, repetidas por cantidad.
        select item.service_id
          from public.order_items item
          cross join lateral generate_series(1, item.quantity)
         where item.order_id = p_order_id
           and item.service_id is not null

        union all

        -- Cantidad comprada del combo por cantidad interna de cada plataforma.
        select combo_item.service_id
          from public.order_items item
          join public.streaming_combo_items combo_item on combo_item.combo_id = item.combo_id
          cross join lateral generate_series(1, item.quantity * combo_item.quantity)
         where item.order_id = p_order_id
           and item.combo_id is not null
      ) productos
  loop
    v_profile_id := null;

    select ap.id
      into v_profile_id
      from public.account_profiles ap
      join public.streaming_accounts acc on acc.id = ap.account_id
     where acc.service_id = v_service_id
       and acc.status = 'active'
       and not (ap.id = any(v_profile_ids))
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
      return jsonb_build_object('status', 'sin_cupos', 'service_id', v_service_id);
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
      'referral_reward_id', v_reward,
      'cart', v_order.is_cart
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
