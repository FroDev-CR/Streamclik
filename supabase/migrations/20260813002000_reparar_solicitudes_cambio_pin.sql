-- =============================================================================
-- 0021 · Reparar pin_change_requests
-- =============================================================================
-- Síntoma: «No se pudieron cargar las solicitudes ·
-- column pin_change_requests.note does not exist».
--
-- Causa: la migración 0018 crea la tabla con `create table if not exists`. En
-- una base donde la tabla ya existía —creada a mano o desde un borrador previo
-- sin la columna `note`— volver a aplicarla **no hace absolutamente nada** y
-- tampoco avisa. El esquema se queda a medias y el fallo aparece mucho después,
-- al consultar una columna que el código da por hecha.
--
-- Es la trampa de `if not exists`: protege contra el error de re-ejecución al
-- precio de silenciar las diferencias. Por eso esta migración usa `alter ... add
-- column if not exists`, que sí converge columna a columna en vez de mirar sólo
-- si la tabla está.
--
-- Es idempotente y segura de aplicar aunque la tabla ya esté perfecta.
-- =============================================================================

-- La tabla completa, por si faltara del todo. Idéntica a la de 0018.
create table if not exists public.pin_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  account_profile_id uuid        not null references public.account_profiles (id) on delete cascade,
  requested_by       uuid        not null references public.user_profiles (id)    on delete cascade,
  requested_pin      text        not null check (requested_pin ~ '^[0-9]{4}$'),
  status             text        not null default 'pending'
                                 check (status in ('pending', 'done', 'rejected')),
  note               text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid        references public.user_profiles (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Convergencia columna a columna
-- -----------------------------------------------------------------------------
alter table public.pin_change_requests add column if not exists note        text;
alter table public.pin_change_requests add column if not exists status      text not null default 'pending';
alter table public.pin_change_requests add column if not exists created_at  timestamptz not null default now();
alter table public.pin_change_requests add column if not exists resolved_at timestamptz;
alter table public.pin_change_requests add column if not exists resolved_by uuid references public.user_profiles (id) on delete set null;

-- El CHECK de `status` puede faltar si la columna se añadió suelta.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'pin_change_requests_status_check'
       and conrelid = 'public.pin_change_requests'::regclass
  ) then
    alter table public.pin_change_requests
      add constraint pin_change_requests_status_check
      check (status in ('pending', 'done', 'rejected'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Índices y RLS, por si la tabla se creó sin ellos
-- -----------------------------------------------------------------------------
create unique index if not exists pin_change_requests_una_pendiente
  on public.pin_change_requests (account_profile_id, requested_by)
  where status = 'pending';

create index if not exists pin_change_requests_pendientes
  on public.pin_change_requests (status, created_at desc);

alter table public.pin_change_requests enable row level security;

drop policy if exists "clientes solicitan sobre sus propios perfiles" on public.pin_change_requests;
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

drop policy if exists "clientes ven sus solicitudes" on public.pin_change_requests;
create policy "clientes ven sus solicitudes"
  on public.pin_change_requests for select to authenticated
  using (requested_by = public.current_user_id() or public.is_admin());

drop policy if exists "administradores gestionan solicitudes" on public.pin_change_requests;
create policy "administradores gestionan solicitudes"
  on public.pin_change_requests for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- El trigger que copia el PIN al resolver
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

drop trigger if exists pin_change_requests_aplicar on public.pin_change_requests;
create trigger pin_change_requests_aplicar
  before update on public.pin_change_requests
  for each row execute function public.aplicar_cambio_pin();
