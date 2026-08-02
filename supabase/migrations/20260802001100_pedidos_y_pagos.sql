-- =============================================================================
-- 0011 · Pedidos, comprobantes de pago y entrega automática
-- =============================================================================
-- Primer flujo de venta: el cliente elige plataforma, paga por SINPE, sube el
-- comprobante y espera. El operador lo revisa y con un botón «suelta» la cuenta:
-- el sistema busca un perfil libre y se lo asigna.
--
-- Se elige comprobante manual y no una pasarela a propósito. En Costa Rica SINPE
-- es lo que la gente usa, no tiene comisión y no exige alta de comercio. El
-- coste es una revisión humana por venta, que a este volumen es asumible y
-- además sirve para validar que la gente compra antes de integrar una pasarela.
-- Cuando llegue esa integración, la parte de «pedido confirmado → asignar
-- perfil» ya está hecha: sólo cambia quién confirma.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Estados del pedido
-- -----------------------------------------------------------------------------
-- `esperando_revision` y `aprobado` se separan de `entregado` porque son cosas
-- distintas: un pago puede estar aprobado y aun así no haber cupo libre para
-- entregar. Fundirlos escondería justo el caso que hay que atender a mano.
create type public.order_status as enum (
  'esperando_comprobante',  -- creado, el cliente aún no subió nada
  'esperando_revision',     -- comprobante subido, pendiente de que el operador lo mire
  'entregado',              -- verificado y con perfil asignado
  'rechazado',              -- el comprobante no era válido
  'cancelado'               -- el cliente desistió
);


-- -----------------------------------------------------------------------------
-- 2 · Pedidos
-- -----------------------------------------------------------------------------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references public.user_profiles (id) on delete cascade,
  service_id    uuid        not null references public.streaming_services (id) on delete restrict,

  -- El precio se congela al crear el pedido. Si mañana sube la tarifa, lo que se
  -- cobró sigue siendo lo que el cliente vio al comprar.
  price_amount   numeric(10, 2) not null,
  price_currency text        not null default 'CRC',

  status        public.order_status not null default 'esperando_comprobante',

  -- Ruta dentro del bucket `comprobantes`, no una URL: las URL firmadas caducan
  -- y guardarlas dejaría enlaces muertos en la base de datos.
  receipt_path  text,
  receipt_note  text,
  submitted_at  timestamptz,

  reviewed_at   timestamptz,
  reviewed_by   uuid        references public.user_profiles (id) on delete set null,
  review_note   text,

  -- Asignación resultante. Es la trazabilidad de qué se entregó por este pago.
  assignment_id uuid        references public.profile_assignments (id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index orders_user_idx    on public.orders (user_id, created_at desc);
create index orders_service_idx on public.orders (service_id);

-- Barrido del operador: los pendientes primero y por antigüedad, que es el orden
-- en que hay que atenderlos.
create index orders_pendientes_idx
  on public.orders (submitted_at)
  where status = 'esperando_revision';

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 3 · Row Level Security
-- -----------------------------------------------------------------------------
alter table public.orders enable row level security;

create policy "clientes ven sus pedidos"
  on public.orders for select to authenticated
  using (public.is_admin() or user_id = public.current_user_id());

-- El cliente crea su propio pedido. El WITH CHECK impide que lo cree a nombre de
-- otro, y el estado inicial se fuerza en la aplicación: aquí sólo se garantiza
-- que la fila le pertenece.
create policy "clientes crean sus pedidos"
  on public.orders for insert to authenticated
  with check (user_id = public.current_user_id());

-- El cliente sólo puede tocar su pedido mientras no esté revisado: para adjuntar
-- el comprobante o para desistir. Sin la condición de estado en el USING podría
-- reabrir un pedido ya entregado y volver a mandarlo a revisión.
--
-- El WITH CHECK admite además 'cancelado' porque es el único estado nuevo al que
-- el cliente puede llevar su pedido; si sólo repitiera los dos del USING,
-- cancelar fallaría con un error de política en lugar de funcionar.
create policy "clientes adjuntan su comprobante"
  on public.orders for update to authenticated
  using (
    user_id = public.current_user_id()
    and status in ('esperando_comprobante', 'esperando_revision')
  )
  with check (
    user_id = public.current_user_id()
    and status in ('esperando_comprobante', 'esperando_revision', 'cancelado')
  );

create policy "administradores gestionan pedidos"
  on public.orders for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Nadie borra pedidos: son el registro de qué se cobró. Rechazar es un cambio de
-- estado, no un borrado.


-- -----------------------------------------------------------------------------
-- 4 · Almacenamiento de comprobantes
-- -----------------------------------------------------------------------------
-- Bucket privado. Un comprobante de SINPE lleva nombre, teléfono e importe: no
-- puede quedar accesible por URL pública, que es lo que pasa con un bucket
-- abierto aunque el nombre del archivo sea difícil de adivinar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- La primera carpeta de la ruta es el uuid interno del cliente. Así la política
-- puede comprobar la propiedad sin consultar la tabla de pedidos.
create policy "clientes suben su comprobante"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = public.current_user_id()::text
  );

create policy "clientes y operador leen comprobantes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (
      (storage.foldername(name))[1] = public.current_user_id()::text
      or public.is_admin()
    )
  );

-- Reemplazar el comprobante equivocado es legítimo mientras el pedido no se haya
-- revisado; el borrado queda sólo para el operador.
create policy "clientes reemplazan su comprobante"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = public.current_user_id()::text
  );


-- -----------------------------------------------------------------------------
-- 5 · Datos de cobro
-- -----------------------------------------------------------------------------
-- Una sola fila con los datos de SINPE. En la base de datos y no en variables de
-- entorno porque el operador tiene que poder cambiarlos desde el panel, y desde
-- el móvil, sin redesplegar.
create table public.payment_settings (
  id            boolean primary key default true check (id),
  sinpe_number  text not null default '',
  sinpe_name    text not null default '',
  instructions  text not null default 'Envía el monto exacto por SINPE Móvil y adjunta la captura del comprobante.',
  updated_at    timestamptz not null default now()
);

comment on table public.payment_settings is
  'Fila única (id siempre true). El CHECK sobre la clave primaria es lo que impide que existan dos configuraciones de cobro distintas.';

insert into public.payment_settings (id) values (true) on conflict (id) do nothing;

alter table public.payment_settings enable row level security;

-- Los datos de cobro los ve cualquiera que vaya a pagar; sólo el operador los
-- edita.
create policy "cualquiera consulta los datos de cobro"
  on public.payment_settings for select to authenticated
  using (true);

create policy "administradores editan los datos de cobro"
  on public.payment_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger payment_settings_set_updated_at
  before update on public.payment_settings
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 6 · Soltar la cuenta
-- -----------------------------------------------------------------------------
-- Aprobar un pago y entregar el perfil en una sola operación atómica.
--
-- Es una función y no tres llamadas desde la aplicación por la carrera obvia:
-- dos aprobaciones simultáneas —o un doble clic— elegirían el mismo perfil libre
-- y una de las dos fallaría después de haber marcado el pedido como entregado.
-- Aquí el `FOR UPDATE SKIP LOCKED` reserva el perfil antes de tocar nada más.
--
-- SECURITY DEFINER pero con comprobación explícita de administrador dentro: sin
-- ella, cualquier cliente podría auto-entregarse una cuenta llamando al RPC.
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
  v_admin      uuid;
  v_order      public.orders%rowtype;
  v_profile_id uuid;
  v_assignment uuid;
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
    -- Idempotente: un segundo clic no vuelve a asignar ni devuelve error.
    return jsonb_build_object('status', 'ya_entregado', 'assignment_id', v_order.assignment_id);
  end if;

  -- Primer perfil libre de esa plataforma. `SKIP LOCKED` deja que dos
  -- aprobaciones simultáneas cojan perfiles distintos en lugar de bloquearse.
  select ap.id
    into v_profile_id
    from public.account_profiles ap
    join public.streaming_accounts acc on acc.id = ap.account_id
   where acc.service_id = v_order.service_id
     and acc.status = 'active'
     and not exists (
       select 1
         from public.profile_assignments pa
        where pa.account_profile_id = ap.id
          and pa.status     = 'active'
          and pa.starts_at <= now()
          and (pa.expires_at is null or pa.expires_at > now())
     )
   order by acc.created_at, ap.slot_index
   limit 1
     for update of ap skip locked;

  if v_profile_id is null then
    -- El pago puede ser correcto y aun así no haber stock. Se dice con claridad
    -- en vez de fallar: es un problema de inventario, no del comprobante.
    return jsonb_build_object('status', 'sin_cupos');
  end if;

  insert into public.profile_assignments (account_profile_id, user_id, assigned_by, expires_at)
  values (v_profile_id, v_order.user_id, v_admin, p_expires_at)
  returning id into v_assignment;

  update public.orders
     set status        = 'entregado',
         assignment_id = v_assignment,
         reviewed_at   = now(),
         reviewed_by   = v_admin
   where id = p_order_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'order.delivered',
    'order',
    p_order_id,
    jsonb_build_object('assignment_id', v_assignment, 'user_id', v_order.user_id)
  );

  return jsonb_build_object(
    'status', 'entregado',
    'assignment_id', v_assignment,
    'account_profile_id', v_profile_id
  );
end;
$$;

revoke execute on function public.soltar_cuenta(uuid, timestamptz) from public, anon;
grant execute on function public.soltar_cuenta(uuid, timestamptz) to authenticated;


-- -----------------------------------------------------------------------------
-- 7 · Aviso de pedidos pendientes
-- -----------------------------------------------------------------------------
-- Realtime sobre `orders` permite que al operador le salte el contador de pagos
-- por revisar sin recargar. Es la «notificación» del flujo: no hace falta un
-- canal externo para algo que ocurre mientras tiene el panel abierto.
alter publication supabase_realtime add table public.orders;
alter table public.orders replica identity full;
