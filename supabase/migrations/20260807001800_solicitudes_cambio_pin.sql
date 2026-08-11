-- =============================================================================
-- 0018 · Solicitudes de cambio de PIN
-- =============================================================================
-- El cliente no puede cambiar el PIN de su perfil por su cuenta: hacerlo exige
-- entrar a Netflix con las credenciales de la cuenta, y entregárselas anularía
-- el aislamiento entre los cinco clientes que comparten esa cuenta.
--
-- Así que se modela como una petición: el cliente dice qué PIN quiere, el
-- operador entra y lo cambia. Esta tabla es la cola de esas peticiones.
--
-- `account_profiles.label` y `.profile_pin` ya existían desde el esquema
-- original, así que no hace falta añadirlos.
-- =============================================================================

create table if not exists public.pin_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  account_profile_id uuid        not null references public.account_profiles (id) on delete cascade,
  requested_by       uuid        not null references public.user_profiles (id)    on delete cascade,

  -- Cuatro dígitos, validado en la base y no sólo en el formulario: la Server
  -- Action es un endpoint POST público y el navegador no es la frontera.
  requested_pin      text        not null check (requested_pin ~ '^[0-9]{4}$'),

  status             text        not null default 'pending'
                                 check (status in ('pending', 'done', 'rejected')),
  note               text,

  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid        references public.user_profiles (id) on delete set null
);

-- Una sola petición pendiente por perfil y cliente. Sin esto, pulsar el botón
-- dos veces llena la bandeja del operador de duplicados y no sabe cuál vale.
create unique index if not exists pin_change_requests_una_pendiente
  on public.pin_change_requests (account_profile_id, requested_by)
  where status = 'pending';

-- La pestaña del operador lista las pendientes por antigüedad.
create index if not exists pin_change_requests_pendientes
  on public.pin_change_requests (status, created_at desc);

alter table public.pin_change_requests enable row level security;

-- -----------------------------------------------------------------------------
-- Quién puede pedir un cambio
-- -----------------------------------------------------------------------------
-- No basta con `requested_by = current_user_id()`. Sin comprobar además que el
-- perfil está asignado a quien pide y que la asignación sigue vigente, un
-- cliente podría solicitar el cambio de PIN del perfil de otro: le bastaría con
-- mandar un `account_profile_id` distinto desde fuera de la interfaz. El
-- resultado sería que el operador cambia el PIN de un tercero sin enterarse.
-- -----------------------------------------------------------------------------
create policy "clientes solicitan sobre sus propios perfiles"
  on public.pin_change_requests for insert to authenticated
  with check (
    requested_by = public.current_user_id()
    and exists (
      select 1
        from public.profile_assignments pa
       where pa.account_profile_id = pin_change_requests.account_profile_id
         and pa.user_id            = public.current_user_id()
         and pa.status             = 'active'
         and pa.starts_at         <= now()
         and (pa.expires_at is null or pa.expires_at > now())
    )
  );

create policy "clientes ven sus solicitudes"
  on public.pin_change_requests for select to authenticated
  using (requested_by = public.current_user_id() or public.is_admin());

-- Sólo el operador resuelve. Un cliente que pudiera marcar su propia solicitud
-- como 'done' se auto-confirmaría un cambio que nadie hizo.
create policy "administradores gestionan solicitudes"
  on public.pin_change_requests for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.pin_change_requests is
  'Cola de cambios de PIN. El cliente pide, el operador entra a la plataforma y lo aplica.';

-- -----------------------------------------------------------------------------
-- Cerrar el círculo al resolver
-- -----------------------------------------------------------------------------
-- Al marcar una solicitud como 'done' hay que copiar el PIN nuevo a
-- `account_profiles`. Si se dejara al operador hacerlo a mano en dos pasos, se
-- olvidaría la mitad de las veces y el cliente seguiría viendo el PIN viejo en
-- su panel — y volvería a pedirlo, generando la misma solicitud otra vez.
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_cambio_pin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    update public.account_profiles
       set profile_pin = new.requested_pin
     where id = new.account_profile_id;

    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, public.current_user_id());
  end if;

  return new;
end;
$$;

create trigger pin_change_requests_aplicar
  before update on public.pin_change_requests
  for each row execute function public.aplicar_cambio_pin();
