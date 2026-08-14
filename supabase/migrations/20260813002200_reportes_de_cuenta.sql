-- =============================================================================
-- 0023 · Reportes de cuenta
-- =============================================================================
-- Cuando a un cliente le falla la cuenta —le pide PIN que no tiene, lo saca la
-- verificación de hogar, alguien más está usando su perfil— hoy escribe por
-- WhatsApp. Eso significa que el problema vive en un chat, sin saber de qué
-- cuenta habla, sin captura y sin forma de ver cuántos van.
--
-- Tabla aparte de `pin_change_requests` a propósito: un cambio de PIN es una
-- petición con un dato concreto y una resolución mecánica; un reporte es un
-- problema abierto, con motivo libre y capturas. Meterlos en la misma tabla
-- obligaría a dejar la mitad de las columnas nulas en cada fila.
-- =============================================================================

create table if not exists public.account_reports (
  id            uuid primary key default gen_random_uuid(),

  -- Se apunta a la asignación y no a la cuenta: es lo que ata el reporte a un
  -- cliente concreto y permite comprobar que la cuenta era suya cuando lo
  -- levantó, aunque después se le revoque.
  assignment_id uuid        not null references public.profile_assignments (id) on delete cascade,
  reported_by   uuid        not null references public.user_profiles (id)       on delete cascade,

  reason        text        not null check (char_length(trim(reason)) between 5 and 1000),

  -- Rutas dentro del bucket `reportes`. Varias porque un problema de streaming
  -- casi siempre se explica con dos capturas: el error y la pantalla anterior.
  screenshots   text[]      not null default '{}',

  status        text        not null default 'pending'
                            check (status in ('pending', 'resolved', 'rejected')),
  resolution_note text,

  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid        references public.user_profiles (id) on delete set null
);

-- La pantalla del operador lista lo pendiente por antigüedad.
create index if not exists account_reports_pendientes
  on public.account_reports (status, created_at desc);

create index if not exists account_reports_por_cliente
  on public.account_reports (reported_by);

alter table public.account_reports enable row level security;

-- -----------------------------------------------------------------------------
-- Quién puede reportar
-- -----------------------------------------------------------------------------
-- No basta con `reported_by = current_user_id()`. Sin comprobar que la
-- asignación es suya, un cliente podría abrir reportes sobre la cuenta de otro
-- —bastaría con mandar otro `assignment_id`— y llenar la bandeja del operador de
-- problemas inventados sobre cuentas ajenas.
--
-- A diferencia del cambio de PIN, aquí NO se exige que la asignación siga
-- vigente: el caso más frecuente de reporte es justamente «se me venció y no
-- entiendo por qué» o «dejó de funcionar». Exigir vigencia cerraría la puerta a
-- quien más necesita escribir.
-- -----------------------------------------------------------------------------
drop policy if exists "clientes reportan sus propias cuentas" on public.account_reports;
create policy "clientes reportan sus propias cuentas"
  on public.account_reports for insert to authenticated
  with check (
    reported_by = public.current_user_id()
    and exists (
      select 1
        from public.profile_assignments pa
       where pa.id      = account_reports.assignment_id
         and pa.user_id = public.current_user_id()
    )
  );

drop policy if exists "clientes ven sus reportes" on public.account_reports;
create policy "clientes ven sus reportes"
  on public.account_reports for select to authenticated
  using (reported_by = public.current_user_id() or public.is_admin());

-- Sólo el operador resuelve. Un cliente que pudiera marcar su propio reporte
-- como resuelto se auto-cerraría un problema que nadie miró.
drop policy if exists "administradores gestionan reportes" on public.account_reports;
create policy "administradores gestionan reportes"
  on public.account_reports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.account_reports is
  'Problemas que reporta el cliente sobre una cuenta suya. El operador los resuelve desde Solicitudes.';

-- -----------------------------------------------------------------------------
-- Bucket de capturas
-- -----------------------------------------------------------------------------
-- Privado, como el de comprobantes: una captura de un problema puede llevar el
-- correo de la cuenta, el nombre del perfil y a veces la pantalla de pago.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reportes',
  'reportes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- La primera carpeta de la ruta es el uuid interno del cliente, así que la ruta
-- no es cosmética: es lo que comprueba la política.
drop policy if exists "clientes suben sus capturas de reporte" on storage.objects;
create policy "clientes suben sus capturas de reporte"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reportes'
    and (storage.foldername(name))[1] = public.current_user_id()::text
  );

drop policy if exists "clientes ven sus capturas de reporte" on storage.objects;
create policy "clientes ven sus capturas de reporte"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reportes'
    and (
      (storage.foldername(name))[1] = public.current_user_id()::text
      or public.is_admin()
    )
  );
