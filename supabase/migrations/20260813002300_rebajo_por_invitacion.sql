-- =============================================================================
-- 0024 · La recompensa pasa a ser un rebajo de ₡1000
-- =============================================================================
-- Antes la recompensa por invitar era un perfil gratis por 30 días. Se cambia
-- por un rebajo de ₡1000 en la siguiente compra o renovación: es más barato de
-- regalar, más fácil de explicar y no consume inventario vendible.
--
-- La decisión de aplicarlo **automáticamente** obliga a hacerlo donde nadie
-- pueda saltárselo. Se hace con triggers sobre `orders` y no en las tres Server
-- Actions que crean pedidos —compra directa, carrito y renovación— porque tres
-- copias de la misma regla acaban divergiendo, y la que se olvide será la que
-- cobre de más.
-- =============================================================================

alter table public.profile_rewards
  add column if not exists discount_amount numeric(10,2) not null default 1000;

comment on column public.profile_rewards.discount_amount is
  'Colones que descuenta esta recompensa en la próxima compra o renovación.';

-- Qué pedido consumió la recompensa. Sirve para devolverla si el pago se
-- rechaza y para explicar por qué un pedido costó menos.
alter table public.profile_rewards
  add column if not exists redeemed_order_id uuid references public.orders (id) on delete set null;

-- Cuánto se rebajó realmente en el pedido. Sin esto no habría forma de saber si
-- un pedido de ₡3000 era el precio de lista o un ₡4000 con rebajo aplicado.
alter table public.orders
  add column if not exists discount_amount numeric(10,2) not null default 0;

comment on column public.orders.discount_amount is
  'Rebajo aplicado automáticamente desde las recompensas del cliente.';

-- -----------------------------------------------------------------------------
-- 1 · Aplicar el rebajo al crear el pedido
-- -----------------------------------------------------------------------------
-- BEFORE INSERT porque tiene que modificar el precio antes de guardarlo. El
-- rebajo nunca deja el total por debajo de cero: si alguien acumulara más
-- crédito que el precio, el resto se conserva para la próxima.
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_rebajo_al_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_disponible numeric(10,2);
  v_rebajo     numeric(10,2);
begin
  -- Los pedidos que nacen ya entregados (migraciones, cargas manuales) no pasan
  -- por aquí: el rebajo es para lo que el cliente está a punto de pagar.
  if new.status is distinct from 'esperando_comprobante' then
    return new;
  end if;

  select coalesce(sum(discount_amount), 0)
    into v_disponible
    from public.profile_rewards
   where user_id = new.user_id
     and status  = 'available';

  if v_disponible <= 0 then
    return new;
  end if;

  v_rebajo := least(v_disponible, new.price_amount);

  new.discount_amount := v_rebajo;
  new.price_amount    := new.price_amount - v_rebajo;

  return new;
end;
$$;

drop trigger if exists orders_aplicar_rebajo on public.orders;
create trigger orders_aplicar_rebajo
  before insert on public.orders
  for each row execute function public.aplicar_rebajo_al_pedido();

-- -----------------------------------------------------------------------------
-- 2 · Marcar las recompensas como usadas
-- -----------------------------------------------------------------------------
-- AFTER INSERT y no en el trigger anterior porque hace falta el id del pedido,
-- que en BEFORE todavía no existe.
-- -----------------------------------------------------------------------------
create or replace function public.consumir_rebajos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_restante numeric(10,2);
  v_fila     record;
begin
  if coalesce(new.discount_amount, 0) <= 0 then
    return new;
  end if;

  v_restante := new.discount_amount;

  -- Se consumen de la más antigua a la más nueva, y sólo las que caben en lo
  -- que se rebajó: si el precio era menor que el crédito acumulado, las
  -- sobrantes siguen disponibles.
  for v_fila in
    select id, discount_amount
      from public.profile_rewards
     where user_id = new.user_id
       and status  = 'available'
     order by created_at
     for update
  loop
    exit when v_restante <= 0;

    update public.profile_rewards
       set status            = 'claimed',
           claimed_at        = now(),
           redeemed_order_id = new.id
     where id = v_fila.id;

    v_restante := v_restante - v_fila.discount_amount;
  end loop;

  return new;
end;
$$;

drop trigger if exists orders_consumir_rebajos on public.orders;
create trigger orders_consumir_rebajos
  after insert on public.orders
  for each row execute function public.consumir_rebajos();

-- -----------------------------------------------------------------------------
-- 3 · Devolver el rebajo si el pedido no prospera
-- -----------------------------------------------------------------------------
-- Un pago rechazado o un pedido cancelado no deben costarle al cliente su
-- recompensa. Sin esto, cargar una captura equivocada la quemaría para siempre.
-- -----------------------------------------------------------------------------
create or replace function public.devolver_rebajos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('rechazado', 'cancelado')
     and old.status not in ('rechazado', 'cancelado') then
    update public.profile_rewards
       set status            = 'available',
           claimed_at        = null,
           redeemed_order_id = null
     where redeemed_order_id = new.id
       and status = 'claimed';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_devolver_rebajos on public.orders;
create trigger orders_devolver_rebajos
  after update on public.orders
  for each row execute function public.devolver_rebajos();

-- -----------------------------------------------------------------------------
-- 4 · Las recompensas existentes pasan a ser rebajos
-- -----------------------------------------------------------------------------
-- El usuario confirmó que no hay ninguna sin reclamar, así que esto no debería
-- tocar ninguna fila. Se deja igualmente para que la migración sea correcta en
-- cualquier base donde sí las hubiera.
-- -----------------------------------------------------------------------------
update public.profile_rewards
   set discount_amount = 1000
 where status = 'available'
   and discount_amount is distinct from 1000;
