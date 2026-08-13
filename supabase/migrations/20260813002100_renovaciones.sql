-- =============================================================================
-- 0022 · Renovaciones
-- =============================================================================
-- Hasta ahora renovar era comprar de nuevo: el cliente pagaba, el operador
-- soltaba «una cuenta» y el sistema le entregaba **un perfil libre cualquiera**.
-- Eso le cambiaba el perfil, el PIN y a veces hasta la cuenta de Netflix, cuando
-- lo único que quería era seguir con lo que ya tenía.
--
-- Una renovación es otra cosa: el mismo perfil, más tiempo. Se modela como un
-- pedido normal —para que caiga en la misma cola de Pagos, con su comprobante y
-- su revisión— pero apuntando a la asignación que extiende.
-- =============================================================================

alter table public.orders
  add column if not exists renewal_assignment_id uuid
    references public.profile_assignments (id) on delete set null;

comment on column public.orders.renewal_assignment_id is
  'Si viene informado, el pedido renueva esa asignación en lugar de entregar un perfil nuevo.';

-- Una sola renovación en curso por asignación. Sin esto, pulsar «Renovar» dos
-- veces genera dos pedidos, el cliente paga una vez y el operador no sabe cuál
-- aprobar —y si aprueba los dos, suma sesenta días por un pago de treinta.
create unique index if not exists orders_una_renovacion_pendiente
  on public.orders (renewal_assignment_id)
  where renewal_assignment_id is not null
    and status in ('esperando_comprobante', 'esperando_revision');

-- La cola de Pagos filtra por estado, y ahora también necesita distinguir de un
-- vistazo qué pedidos son renovaciones.
create index if not exists orders_renovaciones
  on public.orders (renewal_assignment_id)
  where renewal_assignment_id is not null;

-- -----------------------------------------------------------------------------
-- Crear la renovación
-- -----------------------------------------------------------------------------
-- El precio se copia del servicio **en el servidor**, igual que en la compra: si
-- viniera del formulario, cualquiera renovaría por un colón editando el HTML.
--
-- Es SECURITY DEFINER porque tiene que leer el precio del servicio y la cuenta a
-- la que pertenece el perfil, y el cliente no tiene permiso para pasearse por el
-- inventario. Lo que sí se comprueba es que la asignación sea suya y esté viva.
-- -----------------------------------------------------------------------------
create or replace function public.crear_renovacion(
  p_assignment_id uuid,
  p_note          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid;
  v_assignment public.profile_assignments%rowtype;
  v_service    public.streaming_services%rowtype;
  v_order_id   uuid;
begin
  v_user := public.current_user_id();

  if v_user is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select * into v_assignment
    from public.profile_assignments
   where id = p_assignment_id
     for update;

  if not found then
    return jsonb_build_object('status', 'no_encontrada');
  end if;

  -- La asignación tiene que ser de quien pide. Sin esto, mandar el id de otro
  -- generaría un pedido que al aprobarse le regalaría un mes a un tercero.
  if v_assignment.user_id <> v_user then
    return jsonb_build_object('status', 'no_encontrada');
  end if;

  if v_assignment.status <> 'active' then
    return jsonb_build_object('status', 'no_activa');
  end if;

  select svc.* into v_service
    from public.account_profiles ap
    join public.streaming_accounts acc on acc.id = ap.account_id
    join public.streaming_services svc on svc.id = acc.service_id
   where ap.id = v_assignment.account_profile_id;

  if not found then
    return jsonb_build_object('status', 'sin_servicio');
  end if;

  -- Si ya hay una renovación en curso se devuelve **esa**, en lugar de fallar
  -- por el índice único: el caso real es alguien que volvió atrás en el
  -- navegador, y lo que quiere es continuar con el pedido que ya empezó.
  select id into v_order_id
    from public.orders
   where renewal_assignment_id = p_assignment_id
     and status in ('esperando_comprobante', 'esperando_revision')
   limit 1;

  if v_order_id is not null then
    return jsonb_build_object('status', 'en_curso', 'order_id', v_order_id);
  end if;

  insert into public.orders (
    user_id, service_id, price_amount, price_currency,
    receipt_note, renewal_assignment_id
  )
  values (
    v_user, v_service.id, v_service.price_amount, v_service.price_currency,
    nullif(trim(coalesce(p_note, '')), ''), p_assignment_id
  )
  returning id into v_order_id;

  return jsonb_build_object(
    'status', 'creada',
    'order_id', v_order_id,
    'price_amount', v_service.price_amount,
    'price_currency', v_service.price_currency
  );
end;
$$;

comment on function public.crear_renovacion is
  'Crea el pedido de renovación de una asignación propia. El precio sale del servicio, nunca del formulario.';

grant execute on function public.crear_renovacion(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Aprobar la renovación
-- -----------------------------------------------------------------------------
-- El equivalente de `soltar_cuenta()` para renovaciones, y por los mismos
-- motivos: una sola transacción, idempotente al doble clic y con la
-- autorización comprobada dentro de la propia función.
--
-- La cuenta de los días parte de `greatest(now(), expires_at)`. Renovar antes de
-- vencer **suma** al tiempo que quedaba, en lugar de tirarlo: quien paga con
-- tres días de antelación no debe perderlos por puntual.
-- -----------------------------------------------------------------------------
create or replace function public.aprobar_renovacion(
  p_order_id uuid,
  p_dias     integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin      uuid;
  v_order      public.orders%rowtype;
  v_assignment public.profile_assignments%rowtype;
  v_nueva      timestamptz;
begin
  v_admin := public.current_user_id();

  if not public.is_admin(v_admin) then
    raise exception 'Sólo un administrador puede aprobar una renovación'
      using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('status', 'no_encontrado');
  end if;

  if v_order.renewal_assignment_id is null then
    return jsonb_build_object('status', 'no_es_renovacion');
  end if;

  if v_order.status = 'entregado' then
    return jsonb_build_object('status', 'ya_renovado');
  end if;

  select * into v_assignment
    from public.profile_assignments
   where id = v_order.renewal_assignment_id
     for update;

  if not found then
    return jsonb_build_object('status', 'asignacion_no_encontrada');
  end if;

  v_nueva := greatest(coalesce(v_assignment.expires_at, now()), now())
             + make_interval(days => p_dias);

  update public.profile_assignments
     set expires_at = v_nueva,
         -- Una asignación que ya había vencido y se paga vuelve a la vida sin
         -- tener que reasignar el perfil, que es justo lo que se quiere evitar.
         status     = 'active'
   where id = v_assignment.id;

  update public.orders
     set status        = 'entregado',
         assignment_id = v_assignment.id,
         reviewed_at   = now(),
         reviewed_by   = v_admin
   where id = p_order_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'order.renewed',
    'order',
    p_order_id,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'dias', p_dias,
      'expires_at', v_nueva
    )
  );

  return jsonb_build_object('status', 'renovado', 'expires_at', v_nueva);
end;
$$;

comment on function public.aprobar_renovacion is
  'Extiende la asignación del pedido y lo marca entregado, en una sola transacción. Los días se suman a lo que quedaba, no lo reemplazan.';

grant execute on function public.aprobar_renovacion(uuid, integer) to authenticated;
