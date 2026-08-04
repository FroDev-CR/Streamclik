-- =============================================================================
-- 0015 · Carrito: varios productos, un pedido y un comprobante
-- =============================================================================
-- Los pedidos históricos conservan service_id/combo_id. Los nuevos pedidos de
-- carrito usan una cabecera de pago en `orders` y sus líneas en `order_items`.
-- La entrega sigue siendo atómica dentro de `soltar_cuenta`: primero bloquea
-- todos los perfiles necesarios y sólo entonces crea las asignaciones.
-- =============================================================================

alter table public.orders
  add column is_cart boolean not null default false;

alter table public.orders
  drop constraint if exists orders_exactly_one_product;

alter table public.orders
  add constraint orders_product_shape check (
    (not is_cart and num_nonnulls(service_id, combo_id) = 1)
    or (is_cart and num_nonnulls(service_id, combo_id) = 0)
  );

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  service_id          uuid references public.streaming_services (id) on delete restrict,
  combo_id            uuid references public.streaming_combos (id) on delete restrict,
  quantity            smallint not null default 1 check (quantity between 1 and 10),
  unit_price_amount   numeric(10, 2) not null check (unit_price_amount >= 0),
  unit_price_currency text not null default 'CRC',
  created_at          timestamptz not null default now(),

  constraint order_items_exactly_one_product
    check (num_nonnulls(service_id, combo_id) = 1)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_service_idx on public.order_items (service_id);
create index order_items_combo_idx on public.order_items (combo_id);

alter table public.order_items enable row level security;

create policy "clientes ven los productos de sus pedidos"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1
        from public.orders pedido
       where pedido.id = order_id
         and (pedido.user_id = public.current_user_id() or public.is_admin())
    )
  );

create policy "administradores gestionan productos de pedidos"
  on public.order_items for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Crea el pedido completo con precios leídos en el servidor. No se conceden
-- inserts directos de `order_items` al cliente: el RPC es la única entrada y
-- vuelve a validar estado, slug, precio, moneda y código de invitación.
create or replace function public.crear_pedido_carrito(
  p_items jsonb,
  p_note text default null,
  p_referral_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user            uuid;
  v_item            jsonb;
  v_canonical       jsonb := '[]'::jsonb;
  v_type            text;
  v_slug            text;
  v_quantity        integer;
  v_product_id      uuid;
  v_price           numeric(10, 2);
  v_currency        text;
  v_order_currency  text;
  v_total           numeric(10, 2) := 0;
  v_order_id        uuid;
  v_referral        jsonb;
  v_referrer        uuid;
  v_referral_code   text;
begin
  v_user := public.current_user_id();

  if v_user is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('status', 'carrito_invalido');
  end if;

  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('status', 'carrito_invalido');
  end if;

  if char_length(coalesce(p_note, '')) > 280 then
    return jsonb_build_object('status', 'nota_invalida');
  end if;

  if trim(coalesce(p_referral_code, '')) <> '' then
    v_referral := public.resolve_referral_code(p_referral_code);

    if v_referral->>'status' = 'codigo_propio' then
      return jsonb_build_object('status', 'codigo_propio');
    end if;

    if v_referral->>'status' <> 'valido' then
      return jsonb_build_object('status', 'codigo_invalido');
    end if;

    v_referrer := (v_referral->>'user_id')::uuid;
    v_referral_code := v_referral->>'code';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_type := lower(trim(coalesce(v_item->>'productType', '')));
    v_slug := lower(trim(coalesce(v_item->>'slug', '')));

    if coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then
      return jsonb_build_object('status', 'carrito_invalido');
    end if;

    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 10 or v_slug = '' then
      return jsonb_build_object('status', 'carrito_invalido');
    end if;

    v_product_id := null;
    v_price := null;
    v_currency := null;

    if v_type = 'service' then
      select id, price_amount, price_currency
        into v_product_id, v_price, v_currency
        from public.streaming_services
       where slug = v_slug and is_active;
    elsif v_type = 'combo' then
      select id, price_amount, price_currency
        into v_product_id, v_price, v_currency
        from public.streaming_combos
       where slug = v_slug and is_active;
    else
      return jsonb_build_object('status', 'carrito_invalido');
    end if;

    if v_product_id is null then
      return jsonb_build_object('status', 'producto_no_disponible', 'slug', v_slug);
    end if;

    if v_order_currency is null then
      v_order_currency := v_currency;
    elsif v_order_currency <> v_currency then
      return jsonb_build_object('status', 'monedas_incompatibles');
    end if;

    v_total := v_total + (v_price * v_quantity);
    v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
      'productType', v_type,
      'productId', v_product_id,
      'quantity', v_quantity,
      'unitPrice', v_price,
      'currency', v_currency
    ));
  end loop;

  insert into public.orders (
    user_id,
    service_id,
    combo_id,
    is_cart,
    price_amount,
    price_currency,
    receipt_note,
    referrer_user_id,
    referral_code_used
  )
  values (
    v_user,
    null,
    null,
    true,
    v_total,
    v_order_currency,
    nullif(trim(coalesce(p_note, '')), ''),
    v_referrer,
    v_referral_code
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_canonical)
  loop
    insert into public.order_items (
      order_id,
      service_id,
      combo_id,
      quantity,
      unit_price_amount,
      unit_price_currency
    )
    values (
      v_order_id,
      case when v_item->>'productType' = 'service' then (v_item->>'productId')::uuid end,
      case when v_item->>'productType' = 'combo' then (v_item->>'productId')::uuid end,
      (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,
      v_item->>'currency'
    );
  end loop;

  return jsonb_build_object(
    'status', 'creado',
    'order_id', v_order_id,
    'total', v_total,
    'currency', v_order_currency
  );
end;
$$;

revoke execute on function public.crear_pedido_carrito(jsonb, text, text) from public, anon;
grant execute on function public.crear_pedido_carrito(jsonb, text, text) to authenticated;

-- Entrega pedidos históricos, combos y carritos con cualquier cantidad. El
-- array de perfiles elegidos evita seleccionar dos veces el mismo slot cuando
-- se compran dos unidades de la misma plataforma.
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

        -- Combo histórico.
        select combo_item.service_id
          from public.streaming_combo_items combo_item
         where combo_item.combo_id = v_order.combo_id

        union all

        -- Plataformas del carrito, repetidas por cantidad.
        select item.service_id
          from public.order_items item
          cross join lateral generate_series(1, item.quantity)
         where item.order_id = p_order_id
           and item.service_id is not null

        union all

        -- Cada unidad de combo produce un perfil por plataforma incluida.
        select combo_item.service_id
          from public.order_items item
          join public.streaming_combo_items combo_item on combo_item.combo_id = item.combo_id
          cross join lateral generate_series(1, item.quantity)
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

  -- Una compra de carrito genera una sola recompensa de referido, aunque tenga
  -- varias líneas o cantidades.
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
