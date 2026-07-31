-- =============================================================================
-- 0009 · Clerk como proveedor de identidad, conservando RLS
-- =============================================================================
-- La autenticación pasa de Supabase Auth a Clerk. La autorización NO se mueve:
-- sigue viviendo en las políticas RLS de este esquema (ADR-0003). Lo único que
-- cambia es de dónde sale la identidad del usuario que consulta.
--
-- Supabase valida el JWT de Clerk contra su JWKS (Third-Party Auth) y expone sus
-- claims en `auth.jwt()`. Lo que desaparece es `auth.uid()`: sólo devuelve algo
-- para sesiones emitidas por Supabase Auth, y con Clerk siempre será null.
--
-- Decisión central de esta migración: **`user_profiles.id` sigue siendo uuid.**
-- Cinco claves foráneas apuntan a esa columna (streaming_accounts.owner_id,
-- profile_assignments.user_id y .assigned_by, notification_outbox.user_id,
-- audit_logs.actor_id). Cambiar el tipo de la clave primaria obligaría a
-- reescribir las cinco y todos sus índices. En su lugar el identificador de
-- Clerk entra como columna nueva, y una función traduce de uno a otro.
--
-- Requisito externo: el JWT de Clerk debe traer el claim `role` con valor
-- "authenticated". Sin él Postgres atiende la petición como `anon`, ninguna
-- política concede nada y todo devuelve vacío sin ningún error visible — el
-- modo de fallo más desconcertante de esta integración.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · La identidad ya no la custodia auth.users
-- -----------------------------------------------------------------------------
-- El perfil colgaba de auth.users con ON DELETE CASCADE. Con Clerk esa tabla
-- deja de poblarse, así que la restricción impediría crear cualquier perfil.
alter table public.user_profiles
  drop constraint if exists user_profiles_id_fkey;

-- El uuid deja de venir de auth.users, así que la tabla debe generarlo.
alter table public.user_profiles
  alter column id set default gen_random_uuid();

alter table public.user_profiles
  add column if not exists clerk_user_id text;

-- Único y parcial: permite convivir con filas heredadas sin id de Clerk durante
-- una migración, pero impide que dos perfiles reclamen la misma identidad.
create unique index if not exists user_profiles_clerk_user_id_key
  on public.user_profiles (clerk_user_id)
  where clerk_user_id is not null;

comment on column public.user_profiles.clerk_user_id is
  'El `sub` del JWT de Clerk (p. ej. user_2abc…). Es la identidad externa; `id` sigue siendo la interna a la que apuntan las claves foráneas.';


-- -----------------------------------------------------------------------------
-- 2 · Traducción de identidad externa a identidad interna
-- -----------------------------------------------------------------------------
-- Sustituye a auth.uid() en todo el esquema. Es SECURITY DEFINER porque tiene
-- que leer user_profiles saltándose RLS: si respetara las políticas, la política
-- de user_profiles la llamaría a ella y ella volvería a consultar user_profiles,
-- que es exactamente la recursión que estas funciones existen para evitar.
--
-- STABLE permite a Postgres evaluarla una vez por consulta en lugar de una vez
-- por fila, que en una tabla de PIN con historial es la diferencia entre una
-- consulta y varios miles.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select up.id
    from public.user_profiles up
   where up.clerk_user_id = auth.jwt() ->> 'sub'
   limit 1;
$$;

comment on function public.current_user_id is
  'Identidad interna del usuario que consulta, resuelta desde el `sub` del JWT de Clerk. Reemplaza a auth.uid(), que con Clerk siempre es null.';

grant execute on function public.current_user_id() to authenticated;


-- -----------------------------------------------------------------------------
-- 3 · Los helpers de autorización pasan a resolver por Clerk
-- -----------------------------------------------------------------------------
-- Sólo cambia el valor por defecto del parámetro. El cuerpo se mantiene idéntico
-- a propósito: la lógica de quién puede ver qué no se está tocando en esta
-- migración, y mezclar ambas cosas haría imposible revisar el diff.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default public.current_user_id())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_profiles up
     where up.id = p_user_id
       and up.role = 'admin'
  );
$$;

comment on function public.is_admin is
  'El rol se lee de la tabla y no del JWT para que revocar admin surta efecto inmediato, sin esperar a que caduque el token de Clerk.';

create or replace function public.has_account_access(
  p_account_id uuid,
  p_user_id    uuid default public.current_user_id()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profile_assignments pa
      join public.account_profiles    ap on ap.id = pa.account_profile_id
     where ap.account_id = p_account_id
       and pa.user_id    = p_user_id
       and pa.status     = 'active'
       and pa.starts_at <= now()
       and (pa.expires_at is null or pa.expires_at > now())
  );
$$;

create or replace function public.can_view_pin(
  p_account_id  uuid,
  p_received_at timestamptz,
  p_user_id     uuid default public.current_user_id()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profile_assignments pa
      join public.account_profiles    ap on ap.id = pa.account_profile_id
     where ap.account_id  = p_account_id
       and pa.user_id     = p_user_id
       and pa.status      = 'active'
       and p_received_at >= pa.starts_at
       and (pa.expires_at is null or p_received_at <= pa.expires_at)
  );
$$;


-- -----------------------------------------------------------------------------
-- 4 · Las seis políticas que nombraban auth.uid() directamente
-- -----------------------------------------------------------------------------
-- Postgres no permite alterar la expresión de una política: hay que recrearla.
-- Las diecinueve restantes pasan por is_admin() y no necesitan tocarse, porque
-- ya heredan el nuevo valor por defecto.
-- -----------------------------------------------------------------------------

drop policy if exists "usuarios leen su propio perfil" on public.user_profiles;
create policy "usuarios leen su propio perfil"
  on public.user_profiles for select to authenticated
  using (id = public.current_user_id() or public.is_admin());

-- El WITH CHECK repite la condición del USING a propósito: sin él, un usuario
-- podría editar su fila y cambiar el `id` a otro. USING controla qué filas se
-- pueden tocar; WITH CHECK controla cómo pueden quedar tras el cambio.
drop policy if exists "usuarios actualizan su propio perfil" on public.user_profiles;
create policy "usuarios actualizan su propio perfil"
  on public.user_profiles for update to authenticated
  using (id = public.current_user_id())
  with check (id = public.current_user_id());

-- El nombre tiene que coincidir **exactamente** con el de la migración 0005.
-- `drop policy if exists` con un nombre equivocado no falla: no encuentra nada,
-- sigue adelante, y el `create` deja una política nueva conviviendo con la
-- vieja. Las de SELECT se combinan con OR, así que el resultado no es un error
-- sino una política huérfana que sigue evaluando auth.uid() para siempre.
drop policy if exists "clientes ven sus perfiles asignados" on public.account_profiles;
create policy "clientes ven sus perfiles asignados"
  on public.account_profiles for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.profile_assignments pa
       where pa.account_profile_id = account_profiles.id
         and pa.user_id = public.current_user_id()
         and pa.status  = 'active'
    )
  );

drop policy if exists "clientes ven sus asignaciones" on public.profile_assignments;
create policy "clientes ven sus asignaciones"
  on public.profile_assignments for select to authenticated
  using (public.is_admin() or user_id = public.current_user_id());

-- Los usuarios registran sus propias acciones (ver un PIN, revelar credenciales)
-- pero no pueden leer el registro: leerlo revelaría actividad de terceros.
drop policy if exists "usuarios registran sus propias acciones" on public.audit_logs;
create policy "usuarios registran sus propias acciones"
  on public.audit_logs for insert to authenticated
  with check (actor_id = public.current_user_id());


-- -----------------------------------------------------------------------------
-- 5 · Alta del perfil en el primer inicio de sesión
-- -----------------------------------------------------------------------------
-- El trigger sobre auth.users deja de dispararse porque esa tabla ya no recibe
-- altas. Lo sustituye una función que la aplicación llama tras autenticar.
--
-- Detalle que decide la seguridad de todo esto: la identidad se lee de
-- `auth.jwt()`, nunca de los parámetros. Si el `sub` viniese por parámetro,
-- cualquier cliente autenticado podría pedir el alta con el identificador de
-- otra persona y quedarse con su perfil — y con sus asignaciones.
--
-- El correo se toma del claim si viene firmado por Clerk; el parámetro sólo se
-- usa como respaldo cuando la plantilla del JWT no lo incluye.
-- -----------------------------------------------------------------------------
create or replace function public.sync_current_user(
  p_email     text default null,
  p_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   text;
  v_email text;
  v_id    uuid;
begin
  v_sub := auth.jwt() ->> 'sub';

  if v_sub is null or v_sub = '' then
    raise exception 'No hay sesión de Clerk en la petición'
      using errcode = '42501';
  end if;

  -- El claim firmado manda sobre el parámetro.
  v_email := coalesce(
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  );

  if v_email is null then
    raise exception 'No se pudo determinar el correo del usuario'
      using errcode = '22004';
  end if;

  insert into public.user_profiles (clerk_user_id, email, full_name)
  values (
    v_sub,
    v_email,
    nullif(trim(coalesce(p_full_name, '')), '')
  )
  on conflict (clerk_user_id) where clerk_user_id is not null
  do update set
    email      = excluded.email,
    full_name  = coalesce(excluded.full_name, public.user_profiles.full_name),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.sync_current_user is
  'Crea o actualiza el perfil del usuario autenticado en Clerk. La identidad sale del JWT, nunca de los parámetros: aceptarla por parámetro permitiría apropiarse del perfil ajeno.';

grant execute on function public.sync_current_user(text, text) to authenticated;

-- Todos los usuarios nacen como 'client'. El rol sigue sin poder pedirse en el
-- alta: un endpoint de "registrarse como admin" sería una escalada de
-- privilegios auto-servida. La promoción se hace por SQL, igual que antes.


-- -----------------------------------------------------------------------------
-- 6 · Retirada del enganche con Supabase Auth
-- -----------------------------------------------------------------------------
-- Se elimina al final para que, si algo de lo anterior falla, la transacción
-- revierta con el esquema anterior intacto.
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
