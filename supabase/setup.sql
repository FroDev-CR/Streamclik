-- =============================================================================
-- StreamClick — instalación completa del esquema en un solo paso
-- =============================================================================
-- GENERADO AUTOMÁTICAMENTE. No editar a mano.
-- Regenerar con:  node scripts/build-setup-sql.mjs
--
-- Este archivo concatena, en orden, todas las migraciones de
-- supabase/migrations/. Existe para poder instalar el esquema pegándolo en el
-- SQL Editor de Supabase, sin instalar la CLI ni Docker.
--
-- La fuente de verdad siguen siendo los archivos de supabase/migrations/: si vas
-- a trabajar con la CLI (`supabase db push`), usa esos y ignora este archivo.
--
-- Cómo usarlo:
--   1. Panel de Supabase → SQL Editor → New query
--   2. Pega todo este contenido y ejecuta (Run)
--   3. Debe terminar sin errores. Es idempotente sólo en la semilla del
--      catálogo; ejecutarlo dos veces sobre la misma base fallará al recrear
--      los tipos, que es el comportamiento correcto.
-- =============================================================================


-- ▼▼▼ 20260731000100_extensions_and_types.sql ▼▼▼

-- =============================================================================
-- 0001 · Extensiones y tipos enumerados
-- =============================================================================
-- Se definen todos los ENUM al principio para que el resto de migraciones sólo
-- añadan tablas. Un ENUM (frente a un CHECK sobre text) da validación a nivel de
-- motor, aparece en los tipos TypeScript generados por la CLI de Supabase y
-- documenta el dominio en el propio esquema.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext"   with schema extensions;

-- Rol de la plataforma. Deliberadamente mínimo: sólo hay operador y cliente.
-- Añadir 'reseller' más adelante es un `alter type ... add value`.
create type public.user_role as enum ('admin', 'client');

-- Ciclo de vida de una cuenta comprada por el operador.
create type public.account_status as enum ('active', 'suspended', 'expired');

-- Vigencia del contrato de un cliente sobre un perfil.
-- 'revoked' se conserva en lugar de borrar la fila: el historial de quién tuvo
-- acceso y hasta cuándo es exactamente lo que resuelve las disputas.
create type public.assignment_status as enum ('active', 'expired', 'revoked');

-- Tipo de código recibido. Netflix envía varios y el cliente necesita saber
-- cuál corresponde a la acción que acaba de intentar.
create type public.pin_code_type as enum (
  'household',       -- "Actualizar Hogar con Netflix" / Household verification
  'login',           -- Código de inicio de sesión temporal
  'signup',          -- Verificación de alta
  'password_reset',  -- Restablecimiento de contraseña
  'unknown'          -- Extraído, pero sin clasificar con confianza
);

-- Resultado del parsing. 'failed' y 'unmatched' no son lo mismo:
--   unmatched → no se encontró código (probablemente correo promocional)
--   failed    → el parser lanzó una excepción (bug que hay que corregir)
create type public.email_parse_status as enum ('parsed', 'unmatched', 'failed', 'ignored');

-- Canales de notificación. 'realtime' es el único implementado en el MVP;
-- el resto existe para que el outbox y las preferencias ya los contemplen.
create type public.notification_channel as enum ('realtime', 'whatsapp', 'telegram', 'push', 'email');

create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');



-- ▼▼▼ 20260731000200_core_tables.sql ▼▼▼

-- =============================================================================
-- 0002 · Tablas del núcleo
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_profiles — espejo de auth.users en el esquema public
-- -----------------------------------------------------------------------------
-- Supabase no permite añadir columnas a auth.users. El patrón canónico es esta
-- tabla espejo, poblada por un trigger dentro de la misma transacción del alta
-- para que nunca exista un auth.users sin su perfil.
-- -----------------------------------------------------------------------------
create table public.user_profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  email                     text        not null,
  full_name                 text,
  phone                     text,
  role                      public.user_role not null default 'client',

  -- Preparado para las integraciones futuras (ver docs/05-integraciones-futuras.md).
  telegram_chat_id          text,
  notification_preferences  jsonb       not null default
                              '{"realtime": true, "whatsapp": false, "telegram": false, "push": false}'::jsonb,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.user_profiles is
  'Datos de aplicación del usuario. El rol vive aquí y no en el JWT para que revocar admin tenga efecto inmediato sin esperar a que expire el token.';

-- -----------------------------------------------------------------------------
-- streaming_services — catálogo
-- -----------------------------------------------------------------------------
-- Netflix es el primero, pero el pipeline es genérico desde el día uno: añadir
-- Disney+ debe ser un INSERT y un parser, no una rama en el webhook.
-- -----------------------------------------------------------------------------
create table public.streaming_services (
  id                 uuid primary key default gen_random_uuid(),
  slug               text        not null unique,   -- 'netflix' → selecciona el parser
  name               text        not null,
  brand_color        text        not null default '#E50914',
  sender_domains     text[]      not null default '{}',  -- remitentes legítimos
  pin_regex_patterns text[]      not null default '{}',  -- fallback configurable en caliente
  pin_ttl_seconds    integer     not null default 900,   -- Netflix: 15 minutos
  is_active          boolean     not null default true,
  created_at         timestamptz not null default now()
);

comment on column public.streaming_services.pin_regex_patterns is
  'Patrones de respaldo editables sin desplegar. La ruta principal es el parser tipado en TypeScript; esto permite reaccionar en minutos si el proveedor cambia el formato del correo un domingo.';

-- -----------------------------------------------------------------------------
-- streaming_accounts — el activo que el operador revende
-- -----------------------------------------------------------------------------
create table public.streaming_accounts (
  id                 uuid primary key default gen_random_uuid(),
  service_id         uuid        not null references public.streaming_services (id) on delete restrict,
  owner_id           uuid        not null references public.user_profiles (id) on delete restrict,

  label              text        not null,          -- 'Netflix 01' (uso interno del operador)

  -- Llave de enrutamiento del webhook. Se normaliza a minúsculas en la app y se
  -- garantiza única con un índice sobre lower() en la migración de índices.
  inbox_email        text        not null,

  -- Credenciales que el cliente usa en Netflix. No pueden hashearse porque el
  -- cliente necesita el valor original. Ver docs/adr/0007.
  login_email        text        not null,
  login_password_enc text        not null,

  max_profiles       smallint    not null default 5 check (max_profiles between 1 and 10),
  status             public.account_status not null default 'active',
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.streaming_accounts.login_password_enc is
  'Cifrado en la capa de aplicación (AES-256-GCM). El sufijo _enc hace explícito que nunca debe contener texto plano. Deuda técnica reconocida en docs/adr/0007.';

-- -----------------------------------------------------------------------------
-- account_profiles — el slot físico dentro de la cuenta
-- -----------------------------------------------------------------------------
-- Separado de la asignación a propósito: el slot existe aunque nadie lo tenga
-- contratado, y así se preserva el historial entre inquilinos.
-- -----------------------------------------------------------------------------
create table public.account_profiles (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid        not null references public.streaming_accounts (id) on delete cascade,
  label       text        not null,                    -- 'Perfil 1'
  profile_pin text,                                    -- PIN de 4 dígitos del perfil en Netflix
  slot_index  smallint    not null check (slot_index between 1 and 10),
  created_at  timestamptz not null default now(),

  unique (account_id, slot_index)
);

-- -----------------------------------------------------------------------------
-- profile_assignments — el contrato temporal cliente ↔ perfil
-- -----------------------------------------------------------------------------
create table public.profile_assignments (
  id                 uuid primary key default gen_random_uuid(),
  account_profile_id uuid        not null references public.account_profiles (id) on delete cascade,
  user_id            uuid        not null references public.user_profiles (id) on delete cascade,
  assigned_by        uuid        references public.user_profiles (id) on delete set null,

  status             public.assignment_status not null default 'active',
  starts_at          timestamptz not null default now(),
  expires_at         timestamptz,                       -- null = sin vencimiento
  revoked_at         timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint assignment_window_is_valid
    check (expires_at is null or expires_at > starts_at)
);

comment on table public.profile_assignments is
  'starts_at/expires_at delimitan además qué PIN puede ver el cliente: sin esa ventana vería el historial completo del inquilino anterior.';

-- -----------------------------------------------------------------------------
-- inbound_emails — registro crudo de cada correo
-- -----------------------------------------------------------------------------
-- Existe por tres motivos: idempotencia (message_id único), diagnóstico cuando un
-- parser falla, y auditoría de qué llegó y cuándo.
-- -----------------------------------------------------------------------------
create table public.inbound_emails (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        references public.streaming_accounts (id) on delete set null,

  message_id    text        not null,   -- UNIQUE: es la garantía de idempotencia
  to_address    text        not null,
  from_address  text        not null,
  subject       text,
  body_text     text,
  body_html     text,
  raw_payload   jsonb,                  -- purgar a los 30 días: contiene datos personales

  parse_status  public.email_parse_status not null default 'unmatched',
  parse_error   text,

  received_at   timestamptz not null,   -- momento del correo, no del INSERT
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- verification_pins — el producto final del pipeline
-- -----------------------------------------------------------------------------
create table public.verification_pins (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid        not null references public.streaming_accounts (id) on delete cascade,
  inbound_email_id uuid        references public.inbound_emails (id) on delete set null,

  code             text        not null check (code ~ '^[0-9]{4,8}$'),
  code_type        public.pin_code_type not null default 'unknown',
  action_url       text,                      -- enlace "Sí, fui yo" cuando existe

  received_at      timestamptz not null,
  expires_at       timestamptz not null,

  created_at       timestamptz not null default now(),

  constraint pin_expires_after_reception check (expires_at > received_at)
);

comment on table public.verification_pins is
  'Ningún rol authenticated tiene INSERT aquí: sólo la service_role desde el webhook. Un cliente no puede fabricarse un PIN.';

-- -----------------------------------------------------------------------------
-- notification_outbox — patrón transactional outbox
-- -----------------------------------------------------------------------------
-- La ingesta encola aquí dentro de la misma transacción que el PIN y responde de
-- inmediato. Si llamara a la API de WhatsApp en línea, un fallo de esa API
-- provocaría el timeout del proveedor de correo y el reintento del correo entero.
-- -----------------------------------------------------------------------------
create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  pin_id          uuid        references public.verification_pins (id) on delete cascade,
  user_id         uuid        not null references public.user_profiles (id) on delete cascade,

  channel         public.notification_channel not null,
  payload         jsonb       not null,
  status          public.notification_status  not null default 'pending',

  attempts        smallint    not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),  -- backoff exponencial
  sent_at         timestamptz,

  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- audit_logs — quién vio qué y cuándo
-- -----------------------------------------------------------------------------
-- En un negocio de cuentas compartidas la disputa típica es "alguien más usó mi
-- perfil". Este registro es lo que la resuelve.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid        references public.user_profiles (id) on delete set null,
  action      text        not null,   -- 'pin.viewed', 'credentials.revealed', 'assignment.created'
  entity_type text        not null,
  entity_id   uuid,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);



-- ▼▼▼ 20260731000300_indexes_and_triggers.sql ▼▼▼

-- =============================================================================
-- 0003 · Índices, invariantes y triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------

-- Enrutamiento del webhook: la consulta más caliente del pipeline de ingesta.
-- El índice va sobre lower() porque las direcciones se normalizan a minúsculas
-- antes de buscar; sin él, la búsqueda normalizada no usaría el índice.
create unique index streaming_accounts_inbox_email_key
  on public.streaming_accounts (lower(inbox_email));

create index streaming_accounts_owner_idx   on public.streaming_accounts (owner_id);
create index streaming_accounts_service_idx on public.streaming_accounts (service_id);

create index account_profiles_account_idx on public.account_profiles (account_id);

-- Consulta del dashboard en cada carga: "mis asignaciones activas".
-- Índice parcial: sólo las activas, que es lo único que se consulta en caliente.
create index profile_assignments_active_user_idx
  on public.profile_assignments (user_id)
  where status = 'active';

create index profile_assignments_profile_idx on public.profile_assignments (account_profile_id);

-- INVARIANTE DE NEGOCIO MÁS IMPORTANTE DEL SISTEMA:
-- un perfil no puede tener dos asignaciones activas simultáneas.
-- Vive en la base de datos y no en el caso de uso porque dos peticiones
-- concurrentes pueden pasar la misma validación en código, pero no el mismo
-- índice único.
create unique index one_active_assignment_per_profile
  on public.profile_assignments (account_profile_id)
  where status = 'active';

-- Idempotencia de la ingesta.
create unique index inbound_emails_message_id_key on public.inbound_emails (message_id);
create index inbound_emails_account_idx on public.inbound_emails (account_id, received_at desc);

-- "Último PIN" y el historial paginado, que son la pantalla principal.
create index verification_pins_account_received_idx
  on public.verification_pins (account_id, received_at desc);

-- Barrido del worker de notificaciones.
create index notification_outbox_pending_idx
  on public.notification_outbox (next_attempt_at)
  where status = 'pending';

create index audit_logs_actor_idx  on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
-- En un trigger y no en la aplicación: así ninguna ruta de escritura futura puede
-- olvidarlo, incluidas las actualizaciones manuales desde el panel de Supabase.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create trigger streaming_accounts_set_updated_at
  before update on public.streaming_accounts
  for each row execute function public.set_updated_at();

create trigger profile_assignments_set_updated_at
  before update on public.profile_assignments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Alta de usuario: auth.users → public.user_profiles
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER y disparado por Auth, de modo que la fila se crea dentro de la
-- misma transacción del registro. Hacerlo desde la aplicación tras el signUp
-- dejaría usuarios huérfanos cada vez que fallara la segunda llamada.
--
-- El rol es SIEMPRE 'client'. Promover a admin es una operación deliberada de
-- base de datos: aceptar el rol desde los metadatos del registro sería una
-- escalada de privilegios auto-servida.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Caducidad de asignaciones
-- -----------------------------------------------------------------------------
-- Marca como 'expired' las asignaciones vencidas. Se invoca desde pg_cron o desde
-- el worker. Importa para la seguridad, no sólo para el reporte: una asignación
-- vencida pero aún 'active' seguiría concediendo acceso a los PIN vía RLS.
-- -----------------------------------------------------------------------------
create or replace function public.expire_due_assignments()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.profile_assignments
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_due_assignments() from public, anon, authenticated;



-- ▼▼▼ 20260731000400_authorization_helpers.sql ▼▼▼

-- =============================================================================
-- 0004 · Funciones auxiliares de autorización
-- =============================================================================
-- Las políticas RLS no pueden consultar directamente otras tablas protegidas: la
-- política de A consultaría B, cuya política consultaría A, provocando recursión
-- infinita. La solución estándar son funciones SECURITY DEFINER, que se ejecutan
-- con los permisos del creador y por tanto omiten RLS dentro de su cuerpo.
--
-- SECURITY DEFINER es potente y por eso TODAS fijan `search_path`. Sin esa línea,
-- un atacante capaz de crear objetos en un esquema que preceda a public podría
-- suplantar las tablas referenciadas dentro de la función. Es la vulnerabilidad
-- clásica de SECURITY DEFINER en Postgres.
--
-- Todas son STABLE: Postgres puede cachear el resultado dentro de una misma
-- consulta, evitando reevaluarlas fila por fila.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ¿Es administrador?
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
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
  'El rol se lee de la tabla y no del JWT para que revocar admin surta efecto inmediato.';

-- -----------------------------------------------------------------------------
-- ¿Tiene el usuario una asignación activa sobre algún perfil de esta cuenta?
-- -----------------------------------------------------------------------------
-- Comprueba también la vigencia temporal: una asignación 'active' cuyo expires_at
-- ya pasó no debe conceder acceso aunque el barrido de caducidad no haya corrido
-- todavía. Depender sólo del status dejaría una ventana de acceso indebido entre
-- el vencimiento real y la ejecución del cron.
-- -----------------------------------------------------------------------------
create or replace function public.has_account_access(
  p_account_id uuid,
  p_user_id    uuid default auth.uid()
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

-- -----------------------------------------------------------------------------
-- ¿Puede el usuario ver un PIN recibido en este instante concreto?
-- -----------------------------------------------------------------------------
-- Además de la asignación activa, exige que received_at caiga DENTRO de la
-- ventana del contrato. Es la condición de privacidad que se olvida con más
-- frecuencia: sin ella, un cliente que contrata hoy el perfil 3 vería todo el
-- historial de códigos del inquilino anterior.
-- -----------------------------------------------------------------------------
create or replace function public.can_view_pin(
  p_account_id  uuid,
  p_received_at timestamptz,
  p_user_id     uuid default auth.uid()
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

-- Las funciones deben poder invocarse desde las políticas, que se evalúan con el
-- rol del usuario que consulta.
grant execute on function public.is_admin(uuid)                            to authenticated;
grant execute on function public.has_account_access(uuid, uuid)            to authenticated;
grant execute on function public.can_view_pin(uuid, timestamptz, uuid)     to authenticated;



-- ▼▼▼ 20260731000500_rls_policies.sql ▼▼▼

-- =============================================================================
-- 0005 · Row Level Security
-- =============================================================================
-- RLS se activa en TODAS las tablas de public, incluidas las de catálogo. Sin
-- políticas el comportamiento por defecto es denegar todo, que es la postura
-- correcta: una tabla nueva sin política queda cerrada, no abierta.
--
-- Nota sobre `service_role`: omite RLS por completo. Sólo la usa el webhook de
-- ingesta (src/infrastructure/supabase/admin.ts, protegido con `server-only`).
-- =============================================================================

alter table public.user_profiles       enable row level security;
alter table public.streaming_services  enable row level security;
alter table public.streaming_accounts  enable row level security;
alter table public.account_profiles    enable row level security;
alter table public.profile_assignments enable row level security;
alter table public.inbound_emails      enable row level security;
alter table public.verification_pins   enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.audit_logs          enable row level security;

-- -----------------------------------------------------------------------------
-- user_profiles
-- -----------------------------------------------------------------------------
create policy "usuarios leen su propio perfil"
  on public.user_profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- El WITH CHECK repite la condición del USING a propósito: sin él, un usuario
-- podría editar su fila y cambiar el `id` a otro. USING controla qué filas se
-- pueden tocar; WITH CHECK controla cómo pueden quedar tras el cambio.
create policy "usuarios actualizan su propio perfil"
  on public.user_profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "administradores gestionan perfiles"
  on public.user_profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No se define política de INSERT: las filas las crea el trigger
-- handle_new_user() con SECURITY DEFINER. Nadie inserta perfiles a mano.

-- Nota: un cliente puede modificar su propia columna `role`, porque la política
-- de UPDATE se aplica por fila y no por columna. Se cierra con un trigger que
-- congela `role` salvo para administradores.
create or replace function public.guard_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'No autorizado para cambiar el rol del usuario'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger user_profiles_guard_role
  before update on public.user_profiles
  for each row execute function public.guard_user_role_change();

-- -----------------------------------------------------------------------------
-- streaming_services — catálogo, legible por cualquier autenticado
-- -----------------------------------------------------------------------------
create policy "catálogo legible por usuarios autenticados"
  on public.streaming_services for select to authenticated
  using (true);

create policy "administradores gestionan el catálogo"
  on public.streaming_services for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- streaming_accounts
-- -----------------------------------------------------------------------------
-- El cliente ve la cuenta completa, credenciales incluidas, porque el modelo de
-- negocio se lo exige: necesita iniciar sesión en Netflix. La protección es que
-- sólo ve las filas de cuentas donde tiene una asignación vigente.
create policy "clientes ven las cuentas que tienen asignadas"
  on public.streaming_accounts for select to authenticated
  using (public.is_admin() or public.has_account_access(id));

create policy "administradores gestionan cuentas"
  on public.streaming_accounts for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- account_profiles
-- -----------------------------------------------------------------------------
-- El cliente ve únicamente SU perfil, no los otros cuatro de la misma cuenta.
-- Sería una fuga menor pero real: el PIN de perfil ajeno permitiría entrar en él.
create policy "clientes ven sus perfiles asignados"
  on public.account_profiles for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.profile_assignments pa
       where pa.account_profile_id = account_profiles.id
         and pa.user_id = auth.uid()
         and pa.status  = 'active'
    )
  );

create policy "administradores gestionan perfiles de cuenta"
  on public.account_profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- profile_assignments
-- -----------------------------------------------------------------------------
create policy "clientes ven sus asignaciones"
  on public.profile_assignments for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- Sólo administradores asignan y revocan. Un cliente no puede auto-asignarse un
-- perfil: sería equivalente a servirse gratis del inventario.
create policy "administradores gestionan asignaciones"
  on public.profile_assignments for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- verification_pins — la política crítica del sistema
-- -----------------------------------------------------------------------------
-- Esta política es lo que hace que "PIN en tiempo real" sea seguro: Supabase
-- Realtime la evalúa por suscriptor sobre el stream de replicación, de modo que
-- un cliente sin asignación vigente no recibe el evento aunque se suscriba al
-- canal manualmente.
--
-- can_view_pin() exige asignación activa Y que received_at caiga dentro de la
-- ventana del contrato (ver docs/adr/0003).
create policy "clientes ven los PIN de sus cuentas dentro de su ventana"
  on public.verification_pins for select to authenticated
  using (public.is_admin() or public.can_view_pin(account_id, received_at));

-- Deliberadamente NO existe política de INSERT/UPDATE/DELETE para el rol
-- authenticated. Los PIN sólo los escribe la service_role desde el webhook.
-- Un cliente no puede fabricarse un código válido.

-- -----------------------------------------------------------------------------
-- inbound_emails — sólo administradores
-- -----------------------------------------------------------------------------
-- Contiene el cuerpo íntegro del correo; no debe exponerse al cliente final.
create policy "administradores leen correos entrantes"
  on public.inbound_emails for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- notification_outbox — sólo administradores
-- -----------------------------------------------------------------------------
create policy "administradores leen el outbox"
  on public.notification_outbox for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
-- Los usuarios registran sus propias acciones (ver un PIN, revelar credenciales)
-- pero no pueden leer el registro: leerlo revelaría actividad de terceros.
create policy "usuarios registran sus propias acciones"
  on public.audit_logs for insert to authenticated
  with check (actor_id = auth.uid());

create policy "administradores leen la auditoría"
  on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Sin políticas de UPDATE/DELETE en audit_logs: un registro de auditoría que se
-- puede editar no es un registro de auditoría.



-- ▼▼▼ 20260731000600_ingest_rpc_and_views.sql ▼▼▼

-- =============================================================================
-- 0006 · RPC de ingesta atómica y vistas de lectura
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ingest_inbound_email — todo el paso 7 del pipeline en una transacción
-- -----------------------------------------------------------------------------
-- Alternativa descartada: tres llamadas separadas desde el cliente JavaScript.
-- No comparten transacción, así que un fallo intermedio dejaría el correo
-- registrado sin PIN, o el PIN sin sus notificaciones encoladas.
--
-- La idempotencia se apoya en la restricción UNIQUE de message_id y no en un
-- SELECT previo: dos entregas simultáneas del mismo webhook pasarían ambas un
-- `SELECT ... IF NOT EXISTS`, pero sólo una gana el índice único.
--
-- Se invoca exclusivamente con service_role desde el webhook. Se revoca a los
-- roles públicos de forma explícita: un cliente que pudiera llamarla se
-- fabricaría PIN a voluntad, saltándose por completo las políticas RLS.
-- -----------------------------------------------------------------------------
create or replace function public.ingest_inbound_email(
  p_message_id   text,
  p_to_address   text,
  p_from_address text,
  p_subject      text,
  p_body_text    text,
  p_body_html    text,
  p_raw_payload  jsonb,
  p_received_at  timestamptz,
  p_code         text          default null,
  p_code_type    public.pin_code_type default 'unknown',
  p_action_url   text          default null,
  p_parse_status public.email_parse_status default 'unmatched',
  p_parse_error  text          default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account   public.streaming_accounts%rowtype;
  v_email_id  uuid;
  v_pin_id    uuid;
  v_ttl       integer;
  v_recipients integer := 0;
begin
  -- 1. Resolver la cuenta por la dirección de ingesta normalizada.
  --    Se descartan las sub-direcciones (netflix1+algo@… → netflix1@…) porque
  --    algunos proveedores las añaden y la cuenta no se encontraría.
  select a.* into v_account
    from public.streaming_accounts a
   where lower(a.inbox_email) = lower(
           split_part(split_part(p_to_address, '+', 1), '@', 1)
           || '@' ||
           split_part(p_to_address, '@', 2)
         )
   limit 1;

  -- 2. Registrar el correo. ON CONFLICT es la puerta de idempotencia: si el
  --    proveedor reintenta, se sale aquí sin efectos secundarios.
  insert into public.inbound_emails (
    account_id, message_id, to_address, from_address, subject,
    body_text, body_html, raw_payload, parse_status, parse_error, received_at
  )
  values (
    v_account.id, p_message_id, p_to_address, p_from_address, p_subject,
    p_body_text, p_body_html, p_raw_payload,
    case when v_account.id is null then 'ignored'::public.email_parse_status
         else p_parse_status end,
    p_parse_error, p_received_at
  )
  on conflict (message_id) do nothing
  returning id into v_email_id;

  if v_email_id is null then
    return jsonb_build_object('status', 'duplicate', 'message_id', p_message_id);
  end if;

  -- 3. Correo dirigido a un buzón que no corresponde a ninguna cuenta.
  --    Se acusa recibo y se descarta: devolver error haría que el proveedor
  --    reintentara indefinidamente correo que nunca va a casar.
  if v_account.id is null then
    return jsonb_build_object('status', 'ignored', 'inbound_email_id', v_email_id);
  end if;

  if p_code is null or p_parse_status <> 'parsed' then
    return jsonb_build_object(
      'status', 'unparsed',
      'inbound_email_id', v_email_id,
      'account_id', v_account.id
    );
  end if;

  -- 4. Persistir el PIN con el TTL configurado para el servicio.
  select s.pin_ttl_seconds into v_ttl
    from public.streaming_services s
   where s.id = v_account.service_id;

  insert into public.verification_pins (
    account_id, inbound_email_id, code, code_type, action_url, received_at, expires_at
  )
  values (
    v_account.id, v_email_id, p_code, p_code_type, p_action_url, p_received_at,
    p_received_at + make_interval(secs => coalesce(v_ttl, 900))
  )
  returning id into v_pin_id;

  -- 5. Encolar notificaciones en la MISMA transacción (transactional outbox).
  --    Una fila por usuario con asignación vigente y por canal que tenga
  --    habilitado. 'realtime' no se encola: lo entrega la replicación de Postgres.
  with recipients as (
    select distinct pa.user_id, up.notification_preferences
      from public.profile_assignments pa
      join public.account_profiles    ap on ap.id = pa.account_profile_id
      join public.user_profiles       up on up.id = pa.user_id
     where ap.account_id = v_account.id
       and pa.status     = 'active'
       and pa.starts_at <= p_received_at
       and (pa.expires_at is null or pa.expires_at >= p_received_at)
  ),
  queued as (
    insert into public.notification_outbox (pin_id, user_id, channel, payload)
    select v_pin_id,
           r.user_id,
           ch.channel,
           jsonb_build_object(
             'pin_id',       v_pin_id,
             'code',         p_code,
             'code_type',    p_code_type,
             'account_label', v_account.label,
             'expires_at',   p_received_at + make_interval(secs => coalesce(v_ttl, 900))
           )
      from recipients r
      cross join lateral (
        values ('whatsapp'::public.notification_channel),
               ('telegram'::public.notification_channel),
               ('push'::public.notification_channel)
      ) as ch(channel)
     where coalesce((r.notification_preferences ->> ch.channel::text)::boolean, false)
    returning 1
  )
  select count(*) into v_recipients from queued;

  return jsonb_build_object(
    'status',           'created',
    'inbound_email_id', v_email_id,
    'pin_id',           v_pin_id,
    'account_id',       v_account.id,
    'queued_notifications', v_recipients
  );
end;
$$;

-- Cierre explícito: sólo service_role.
revoke execute on function public.ingest_inbound_email(
  text, text, text, text, text, text, jsonb, timestamptz,
  text, public.pin_code_type, text, public.email_parse_status, text
) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Vistas de lectura
-- -----------------------------------------------------------------------------
-- security_invoker = true es OBLIGATORIO. Una vista normal en Postgres se ejecuta
-- con los permisos de quien la creó (el propietario del esquema), lo que saltaría
-- las políticas RLS del usuario que consulta y abriría un hueco silencioso: la
-- tabla queda protegida pero la vista sobre ella no.
-- -----------------------------------------------------------------------------

create view public.v_my_accounts
with (security_invoker = true)
as
select
  acc.id                as account_id,
  acc.label             as account_label,
  acc.login_email,
  acc.login_password_enc,
  acc.status            as account_status,
  svc.slug              as service_slug,
  svc.name              as service_name,
  svc.brand_color,
  ap.id                 as account_profile_id,
  ap.label              as profile_label,
  ap.profile_pin,
  ap.slot_index,
  pa.id                 as assignment_id,
  pa.user_id,
  pa.starts_at,
  pa.expires_at,
  pa.status             as assignment_status
from public.profile_assignments pa
join public.account_profiles    ap  on ap.id  = pa.account_profile_id
join public.streaming_accounts  acc on acc.id = ap.account_id
join public.streaming_services  svc on svc.id = acc.service_id;

comment on view public.v_my_accounts is
  'Vista de presentación del dashboard. Las filas visibles las determina RLS, no un WHERE: la misma vista sirve al cliente (sus asignaciones) y al admin (todas).';

-- Último PIN por cuenta. DISTINCT ON es la forma idiomática en Postgres de
-- resolver "la fila más reciente por grupo" y aprovecha directamente el índice
-- (account_id, received_at desc).
create view public.v_latest_pins
with (security_invoker = true)
as
select distinct on (vp.account_id)
  vp.id,
  vp.account_id,
  vp.code,
  vp.code_type,
  vp.action_url,
  vp.received_at,
  vp.expires_at
from public.verification_pins vp
order by vp.account_id, vp.received_at desc;

grant select on public.v_my_accounts to authenticated;
grant select on public.v_latest_pins to authenticated;



-- ▼▼▼ 20260731000700_realtime.sql ▼▼▼

-- =============================================================================
-- 0007 · Realtime
-- =============================================================================
-- Supabase Realtime lee el WAL de Postgres y evalúa las políticas RLS por
-- suscriptor: cada cliente recibe únicamente las filas que su política le
-- permitiría leer con un SELECT. Es lo que hace que la entrega de PIN en vivo sea
-- segura sin ninguna lógica de autorización adicional en el cliente.
-- =============================================================================

alter publication supabase_realtime add table public.verification_pins;

-- REPLICA IDENTITY FULL incluye la fila completa en el WAL. Es necesario porque
-- la política de verification_pins filtra por `account_id` y `received_at`: con
-- la identidad por defecto (sólo la clave primaria) Realtime no tendría esas
-- columnas disponibles para evaluar RLS ni para aplicar el filtro del canal.
--
-- Coste: más volumen de WAL. Aceptable en esta tabla, cuyas filas son pequeñas y
-- de escritura poco frecuente (unos pocos códigos por cuenta y día).
alter table public.verification_pins replica identity full;

-- Las asignaciones también se emiten: permite que el dashboard de un cliente
-- reaccione en el momento en que un administrador le concede o revoca acceso,
-- sin recargar la página.
alter publication supabase_realtime add table public.profile_assignments;
alter table public.profile_assignments replica identity full;



-- ▼▼▼ 20260731000800_seed_catalog.sql ▼▼▼

-- =============================================================================
-- 0008 · Semilla del catálogo de servicios
-- =============================================================================
-- Idempotente (ON CONFLICT sobre el slug) para poder ejecutarse en cada
-- `supabase db reset` sin duplicar filas.
--
-- Los patrones de esta tabla son el respaldo configurable en caliente. La ruta
-- principal de extracción es el parser tipado de
-- src/infrastructure/email/parsers/netflix.parser.ts, que además clasifica el
-- tipo de código. Estos patrones permiten reaccionar en minutos si Netflix
-- cambia el formato del correo, sin necesidad de desplegar.
-- =============================================================================

insert into public.streaming_services
  (slug, name, brand_color, sender_domains, pin_regex_patterns, pin_ttl_seconds)
values
  (
    'netflix',
    'Netflix',
    '#E50914',
    array['netflix.com', 'members.netflix.com', 'account.netflix.com'],
    array[
      -- Anclados a contexto y en orden de especificidad. Importa: los correos de
      -- Netflix contienen otros números (año del pie de página, importes), y un
      -- \d{4,6} suelto extraería "2026" con total alegría.
      '(?:código|codigo|code)[^0-9]{0,40}(\d{4,6})',
      '(?:verification code|código de verificación)[^0-9]{0,40}(\d{4,6})',
      '(\d{4,6})[^0-9]{0,30}(?:es tu código|is your code)'
    ],
    900   -- Netflix: 15 minutos
  ),
  (
    'disney-plus',
    'Disney+',
    '#113CCF',
    array['disneyplus.com', 'mail.disneyplus.com'],
    array['(?:one-time passcode|código de acceso)[^0-9]{0,40}(\d{6})'],
    900
  ),
  (
    'prime-video',
    'Prime Video',
    '#00A8E1',
    array['amazon.com', 'primevideo.com'],
    array['(?:OTP|código)[^0-9]{0,40}(\d{6})'],
    600
  )
on conflict (slug) do update
  set name               = excluded.name,
      brand_color        = excluded.brand_color,
      sender_domains     = excluded.sender_domains,
      pin_regex_patterns = excluded.pin_regex_patterns,
      pin_ttl_seconds    = excluded.pin_ttl_seconds;

-- Disney+ y Prime Video quedan inactivos: el catálogo está listo, pero sin
-- parser tipado y sin correos reales con los que hacer tests, activarlos sólo
-- produciría PIN mal extraídos.
update public.streaming_services
   set is_active = false
 where slug in ('disney-plus', 'prime-video');



-- ▼▼▼ 20260801000900_clerk_como_proveedor_externo.sql ▼▼▼

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



-- ▼▼▼ 20260801001000_catalogo_publico.sql ▼▼▼

-- =============================================================================
-- 0010 · Catálogo público: precio por servicio y disponibilidad agregada
-- =============================================================================
-- La portada tiene que mostrar qué se vende, a cuánto y cuántos perfiles quedan
-- libres. Nada de eso puede leerse con las políticas actuales: `anon` no tiene
-- acceso a ninguna tabla, y es correcto que así sea —`streaming_accounts`
-- contiene credenciales de cuentas reales.
--
-- La solución no es abrir las tablas, sino exponer **sólo el agregado**: una
-- función SECURITY DEFINER que devuelve nombre, precio y un recuento. De ahí no
-- se puede deducir ningún correo, ninguna contraseña ni quién tiene contratado
-- qué. Es la diferencia entre publicar un escaparate y publicar el almacén.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Precio de venta por servicio
-- -----------------------------------------------------------------------------
-- El precio vive en la base de datos y no en el código para que cambiarlo sea un
-- UPDATE y no un despliegue. Es lo primero que se retoca al ajustar márgenes.
alter table public.streaming_services
  add column if not exists price_amount numeric(10, 2) not null default 0,
  add column if not exists price_currency text not null default 'CRC',
  add column if not exists tagline text;

comment on column public.streaming_services.price_amount is
  'Precio mensual por perfil. Numeric y no float: con dinero, el redondeo binario acaba produciendo céntimos fantasma.';

comment on column public.streaming_services.tagline is
  'Frase corta para la tarjeta del catálogo. Null usa un texto por defecto en la interfaz.';


-- -----------------------------------------------------------------------------
-- 2 · Catálogo público
-- -----------------------------------------------------------------------------
-- Un perfil cuenta como disponible si pertenece a una cuenta activa y no tiene
-- ninguna asignación vigente. Se comprueban también las fechas y no sólo el
-- estado: entre que una asignación vence y el cron la marca como `expired` hay
-- una ventana en la que seguiría figurando como ocupada, y el escaparate diría
-- que no queda stock cuando sí lo hay.
--
-- SECURITY DEFINER porque `anon` no puede leer las tablas subyacentes. Devuelve
-- exclusivamente agregados: ni un solo dato identificable de una cuenta.
-- -----------------------------------------------------------------------------
create or replace function public.catalogo_publico()
returns table (
  slug             text,
  nombre           text,
  color            text,
  lema             text,
  precio           numeric,
  moneda           text,
  disponibles      bigint,
  total            bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.slug,
    s.name,
    s.brand_color,
    s.tagline,
    s.price_amount,
    s.price_currency,
    count(ap.id) filter (
      where not exists (
        select 1
          from public.profile_assignments pa
         where pa.account_profile_id = ap.id
           and pa.status     = 'active'
           and pa.starts_at <= now()
           and (pa.expires_at is null or pa.expires_at > now())
      )
    ) as disponibles,
    count(ap.id) as total
  from public.streaming_services s
  left join public.streaming_accounts acc
    on acc.service_id = s.id
   and acc.status = 'active'
  left join public.account_profiles ap
    on ap.account_id = acc.id
  where s.is_active
  group by s.id, s.slug, s.name, s.brand_color, s.tagline, s.price_amount, s.price_currency
  order by s.name;
$$;

comment on function public.catalogo_publico is
  'Escaparate para visitantes anónimos: qué servicios hay, a qué precio y cuántos perfiles quedan libres. Sólo agregados, nunca datos de cuentas.';

grant execute on function public.catalogo_publico() to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3 · Precios iniciales
-- -----------------------------------------------------------------------------
-- Valores de partida en colones. Están pensados para cambiarse desde el panel de
-- Supabase sin desplegar nada:
--
--   update public.streaming_services set price_amount = 4000 where slug = 'netflix';
-- -----------------------------------------------------------------------------
update public.streaming_services
   set price_amount = 3500,
       price_currency = 'CRC',
       tagline = 'Un perfil para ti, con tu propio PIN y tus recomendaciones.'
 where slug = 'netflix';

update public.streaming_services
   set price_amount = 3000,
       price_currency = 'CRC',
       tagline = 'Marvel, Star Wars y Pixar en un perfil sólo tuyo.'
 where slug = 'disney-plus';

update public.streaming_services
   set price_amount = 2500,
       price_currency = 'CRC',
       tagline = 'Series originales y estrenos, sin compartir tu cuenta.'
 where slug = 'prime-video';



-- ▼▼▼ 20260802001100_pedidos_y_pagos.sql ▼▼▼

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



-- ▼▼▼ 20260802001200_max_en_el_catalogo.sql ▼▼▼

-- =============================================================================
-- 0012 · Max en el catálogo público
-- =============================================================================
-- Se añade Max a ₡1 500 y se activa para que aparezca en la portada.
--
-- Los patrones de esta tabla son documentación del formato esperado, no la ruta
-- de extracción: hoy `pin_regex_patterns` NO se lee desde ningún sitio del
-- código. La única extracción real la hace el parser tipado de
-- `src/infrastructure/email/parsers/netflix.parser.ts`, y sólo hay uno.
--
-- Consecuencia que conviene tener escrita: un correo de Max se recibirá y se
-- guardará en `inbound_emails`, pero **no producirá ningún PIN**. El código
-- habrá que reenviarlo a mano hasta que exista `max.parser.ts`. Lo mismo aplica
-- a Disney+ y Prime Video.
-- =============================================================================

insert into public.streaming_services
  (slug, name, brand_color, sender_domains, pin_regex_patterns, pin_ttl_seconds,
   price_amount, price_currency, tagline, is_active)
values
  (
    'max',
    'Max',
    -- Violeta y no el azul real de la marca: en las piezas del catálogo Max
    -- aparece junto a Disney+ (#113CCF) y los dos azules se fundían en una sola
    -- mancha. El violeta los separa de un vistazo.
    '#6D28D9',
    array['max.com', 'hbomax.com', 'mail.max.com'],
    array['(?:código|codigo|code)[^0-9]{0,40}(\d{4,6})'],
    900,
    1500,
    'CRC',
    'Series de HBO, cine y documentales en un perfil sólo tuyo.',
    true
  )
on conflict (slug) do update
  set name               = excluded.name,
      brand_color        = excluded.brand_color,
      sender_domains     = excluded.sender_domains,
      pin_regex_patterns = excluded.pin_regex_patterns,
      pin_ttl_seconds    = excluded.pin_ttl_seconds,
      price_amount       = excluded.price_amount,
      price_currency     = excluded.price_currency,
      tagline            = excluded.tagline,
      is_active          = excluded.is_active;


-- -----------------------------------------------------------------------------
-- Precio de Netflix
-- -----------------------------------------------------------------------------
-- Baja de ₡3 500 a ₡3 000 por decisión comercial. El precio vive en la base de
-- datos justo para esto: cambiarlo es un UPDATE y no un despliegue.
--
-- Importa que quede aquí y no sólo en el panel: el catálogo, la pantalla de
-- compra y el importe que se congela en el pedido salen todos de esta columna.
-- Si la imagen promocional dice ₡3 000 y la web ₡3 500, la discusión con el
-- cliente la pierde el operador.
update public.streaming_services
   set price_amount = 3000
 where slug = 'netflix';


-- -----------------------------------------------------------------------------
-- Disney+ y Prime Video
-- -----------------------------------------------------------------------------
-- La semilla 0008 los dejó inactivos porque no había parser ni correos reales
-- con los que probar. Se activan ahora porque se están vendiendo: aparecen en el
-- catálogo con su disponibilidad real, que será cero mientras no haya cuentas
-- cargadas en el banco.
--
-- Se activan a sabiendas de que sus códigos no se extraen solos todavía. Es una
-- decisión de negocio, no un descuido: mientras no exista el parser, esos
-- códigos se reenvían a mano.
update public.streaming_services
   set is_active = true
 where slug in ('disney-plus', 'prime-video');



-- ▼▼▼ 20260804001300_combos.sql ▼▼▼

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



-- ▼▼▼ 20260804001400_referrals_and_rewards.sql ▼▼▼

-- =============================================================================
-- 0014 · Códigos de invitación y recompensas de perfiles
-- =============================================================================
-- La recompensa no nace al escribir un código ni al subir un comprobante. Se
-- crea dentro de `soltar_cuenta`, en la misma transacción que aprueba el pago y
-- entrega la compra. Así un comprobante rechazado nunca genera un premio.

-- -----------------------------------------------------------------------------
-- 1 · Código único por cliente
-- -----------------------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  loop
    v_code := 'SC-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.user_profiles where referral_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

revoke execute on function public.generate_referral_code() from public, anon, authenticated;

alter table public.user_profiles
  add column if not exists referral_code text;

update public.user_profiles
   set referral_code = public.generate_referral_code()
 where referral_code is null;

alter table public.user_profiles
  alter column referral_code set default public.generate_referral_code(),
  alter column referral_code set not null,
  add constraint user_profiles_referral_code_format
    check (referral_code ~ '^SC-[A-F0-9]{8}$'),
  add constraint user_profiles_referral_code_key unique (referral_code);

comment on column public.user_profiles.referral_code is
  'Código público y único que otro cliente puede usar al comprar. Nunca identifica por sí solo una sesión.';

create or replace function public.keep_referral_code_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.referral_code is distinct from new.referral_code then
    raise exception 'El código de invitación no puede cambiar';
  end if;
  return new;
end;
$$;

create trigger user_profiles_keep_referral_code_immutable
  before update on public.user_profiles
  for each row execute function public.keep_referral_code_immutable();

-- -----------------------------------------------------------------------------
-- 2 · Referido congelado en el pedido
-- -----------------------------------------------------------------------------
alter table public.orders
  add column referrer_user_id uuid references public.user_profiles (id) on delete set null,
  add column referral_code_used text,
  add constraint orders_referrer_is_another_user
    check (referrer_user_id is null or referrer_user_id <> user_id),
  add constraint orders_referral_pair
    check ((referrer_user_id is null) = (referral_code_used is null));

create index orders_referrer_idx
  on public.orders (referrer_user_id, created_at desc)
  where referrer_user_id is not null;

-- Garantía de base de datos: aunque alguien ignore la interfaz y llame a
-- PostgREST directamente, el uuid y el texto tienen que pertenecer al mismo
-- cliente real.
create or replace function public.validate_order_referral()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.referrer_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_profiles
     where id = new.referrer_user_id
       and referral_code = new.referral_code_used
       and role = 'client'
  ) then
    raise exception 'Código de invitación inválido';
  end if;

  return new;
end;
$$;

create trigger orders_validate_referral
  before insert on public.orders
  for each row execute function public.validate_order_referral();

-- El cliente puede reemplazar un comprobante mientras espera. Eso no le da
-- permiso para cambiar el referido después de crear el pedido.
create or replace function public.keep_order_referral_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.referrer_user_id is distinct from new.referrer_user_id
     or old.referral_code_used is distinct from new.referral_code_used then
    raise exception 'El código de invitación de un pedido no puede cambiar';
  end if;

  return new;
end;
$$;

create trigger orders_keep_referral_immutable
  before update on public.orders
  for each row execute function public.keep_order_referral_immutable();

-- Resuelve el código sin exponer la lista de usuarios. La aplicación sólo
-- recibe el uuid que debe congelar en el pedido o un estado entendible.
create or replace function public.resolve_referral_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_owner public.user_profiles%rowtype;
  v_code text;
begin
  v_current := public.current_user_id();
  v_code := upper(trim(coalesce(p_code, '')));

  if v_current is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;

  if v_code = '' then
    return jsonb_build_object('status', 'sin_codigo');
  end if;

  select * into v_owner
    from public.user_profiles
   where referral_code = v_code
     and role = 'client';

  if not found then
    return jsonb_build_object('status', 'invalido');
  end if;

  if v_owner.id = v_current then
    return jsonb_build_object('status', 'codigo_propio');
  end if;

  return jsonb_build_object(
    'status', 'valido',
    'user_id', v_owner.id,
    'code', v_owner.referral_code
  );
end;
$$;

revoke execute on function public.resolve_referral_code(text) from public, anon;
grant execute on function public.resolve_referral_code(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Recompensas
-- -----------------------------------------------------------------------------
create table public.profile_rewards (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.user_profiles (id) on delete cascade,
  source                text not null check (source in ('referral', 'admin')),
  status                text not null default 'available'
                          check (status in ('available', 'claimed', 'cancelled')),
  duration_days         integer not null default 30 check (duration_days between 1 and 365),
  note                  text check (note is null or char_length(note) <= 280),
  referral_order_id     uuid unique references public.orders (id) on delete set null,
  created_by            uuid references public.user_profiles (id) on delete set null,
  claimed_service_id    uuid references public.streaming_services (id) on delete set null,
  claimed_assignment_id uuid unique references public.profile_assignments (id) on delete set null,
  claimed_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint profile_rewards_claim_state check (
    (status = 'claimed' and claimed_service_id is not null and claimed_at is not null)
    or (status <> 'claimed' and claimed_assignment_id is null and claimed_at is null)
  ),
  constraint referral_reward_has_order check (
    source <> 'referral' or referral_order_id is not null
  )
);

create index profile_rewards_user_idx
  on public.profile_rewards (user_id, status, created_at desc);

create trigger profile_rewards_set_updated_at
  before update on public.profile_rewards
  for each row execute function public.set_updated_at();

alter table public.profile_rewards enable row level security;

create policy "clientes ven sus recompensas"
  on public.profile_rewards for select to authenticated
  using (user_id = public.current_user_id() or public.is_admin());

create policy "administradores crean recompensas"
  on public.profile_rewards for insert to authenticated
  with check (public.is_admin());

create policy "administradores gestionan recompensas"
  on public.profile_rewards for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4 · La aprobación de una compra crea la recompensa automáticamente
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

  -- El UNIQUE de referral_order_id hace la aprobación idempotente: un doble
  -- clic o un reintento no puede regalar dos perfiles por la misma compra.
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
      'referral_reward_id', v_reward
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

-- -----------------------------------------------------------------------------
-- 5 · El cliente reclama su perfil cuando quiera
-- -----------------------------------------------------------------------------
create or replace function public.reclamar_recompensa(
  p_reward_id uuid,
  p_service_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_reward public.profile_rewards%rowtype;
  v_profile_id uuid;
  v_assignment_id uuid;
  v_service_name text;
begin
  v_user := public.current_user_id();

  if v_user is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;

  select * into v_reward
    from public.profile_rewards
   where id = p_reward_id
     and user_id = v_user
   for update;

  if not found then
    return jsonb_build_object('status', 'no_encontrada');
  end if;

  if v_reward.status = 'claimed' then
    return jsonb_build_object('status', 'ya_reclamada');
  end if;

  if v_reward.status <> 'available' then
    return jsonb_build_object('status', 'no_disponible');
  end if;

  select name into v_service_name
    from public.streaming_services
   where id = p_service_id
     and is_active;

  if not found then
    return jsonb_build_object('status', 'servicio_no_disponible');
  end if;

  select ap.id
    into v_profile_id
    from public.account_profiles ap
    join public.streaming_accounts acc on acc.id = ap.account_id
   where acc.service_id = p_service_id
     and acc.status = 'active'
     and not exists (
       select 1
         from public.profile_assignments pa
        where pa.account_profile_id = ap.id
          and pa.status = 'active'
     )
   order by acc.created_at, ap.slot_index
   limit 1
     for update of ap skip locked;

  if v_profile_id is null then
    return jsonb_build_object('status', 'sin_cupos');
  end if;

  insert into public.profile_assignments (
    account_profile_id, user_id, assigned_by, expires_at
  )
  values (
    v_profile_id,
    v_user,
    null,
    now() + make_interval(days => v_reward.duration_days)
  )
  returning id into v_assignment_id;

  update public.profile_rewards
     set status = 'claimed',
         claimed_service_id = p_service_id,
         claimed_assignment_id = v_assignment_id,
         claimed_at = now()
   where id = p_reward_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_user,
    'reward.claimed',
    'profile_reward',
    p_reward_id,
    jsonb_build_object(
      'service_id', p_service_id,
      'assignment_id', v_assignment_id,
      'duration_days', v_reward.duration_days
    )
  );

  return jsonb_build_object(
    'status', 'reclamada',
    'assignment_id', v_assignment_id,
    'service_name', v_service_name,
    'duration_days', v_reward.duration_days
  );
end;
$$;

revoke execute on function public.reclamar_recompensa(uuid, uuid) from public, anon;
grant execute on function public.reclamar_recompensa(uuid, uuid) to authenticated;



-- ▼▼▼ 20260804001500_cart_orders.sql ▼▼▼

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



-- ▼▼▼ 20260804001600_platform_icons.sql ▼▼▼

-- =============================================================================
-- 0016 · Logos seleccionables para plataformas
-- =============================================================================

alter table public.streaming_services
  add column icon_key text not null default 'generic'
  check (char_length(icon_key) between 1 and 40);

update public.streaming_services
   set icon_key = case slug
     when 'netflix' then 'netflix'
     when 'disney-plus' then 'disney_plus'
     when 'max' then 'max'
     when 'prime-video' then 'prime_video'
     when 'paramountplus' then 'paramount_plus'
     when 'paramount-plus' then 'paramount_plus'
     else icon_key
   end;

-- El tipo de retorno añade `icono`, por lo que PostgreSQL exige recrear la
-- función en lugar de `create or replace`.
drop function public.catalogo_publico();

create function public.catalogo_publico()
returns table (
  slug             text,
  nombre           text,
  color            text,
  icono            text,
  lema             text,
  precio           numeric,
  moneda           text,
  disponibles      bigint,
  total            bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.slug,
    s.name,
    s.brand_color,
    s.icon_key,
    s.tagline,
    s.price_amount,
    s.price_currency,
    count(ap.id) filter (
      where not exists (
        select 1
          from public.profile_assignments pa
         where pa.account_profile_id = ap.id
           and pa.status = 'active'
           and pa.starts_at <= now()
           and (pa.expires_at is null or pa.expires_at > now())
      )
    ) as disponibles,
    count(ap.id) as total
  from public.streaming_services s
  left join public.streaming_accounts acc
    on acc.service_id = s.id and acc.status = 'active'
  left join public.account_profiles ap on ap.account_id = acc.id
  where s.is_active
  group by s.id
  order by s.name;
$$;

grant execute on function public.catalogo_publico() to anon, authenticated;

drop function public.combos_publicos();

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
    min(coalesce(stock.disponibles, 0))::bigint,
    jsonb_agg(
      jsonb_build_object(
        'slug', servicio.slug,
        'nombre', servicio.name,
        'color', servicio.brand_color,
        'icono', servicio.icon_key
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



-- ▼▼▼ 20260804001700_combo_profile_quantities.sql ▼▼▼

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



-- ▼▼▼ 20260805001800_biblioteca_multimedia.sql ▼▼▼

-- =============================================================================
-- 0018 · Biblioteca multimedia del operador
-- =============================================================================
-- Un respaldo propio para las piezas de publicidad: subir imágenes y vídeos,
-- verlos y descargarlos desde el panel, sin depender de Drive.
--
-- No lleva tabla de metadatos a propósito. El listado sale del propio bucket, y
-- así no existe la divergencia clásica de este patrón: una fila que dice que un
-- archivo existe cuando ya se borró, o un archivo huérfano que no aparece en
-- ninguna parte. Storage es la única fuente de verdad.
--
-- La separación entre imágenes y vídeos también es del bucket: cada archivo va
-- bajo `imagenes/` o `videos/`. Es una carpeta, no una columna, así que no puede
-- desincronizarse del contenido real.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · El bucket
-- -----------------------------------------------------------------------------
-- Privado. Aunque sean piezas pensadas para publicarse, un bucket abierto deja
-- accesible por URL **todo** lo que se suba, incluidos los borradores y lo que
-- se subió por error. Se sirve con URL firmada, igual que los comprobantes.
--
-- 50 MB por archivo: es el techo por defecto de un proyecto de Supabase. Subirlo
-- aquí sin subirlo también en la configuración del proyecto no serviría de nada
-- —manda el menor de los dos—, así que se deja alineado con el límite real.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'multimedia',
  'multimedia',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;


-- -----------------------------------------------------------------------------
-- 2 · Sólo el administrador
-- -----------------------------------------------------------------------------
-- Las cuatro operaciones exigen `is_admin()`. No hay política para clientes:
-- sin política, el comportamiento por defecto de RLS es denegar, que es
-- exactamente lo que se quiere aquí.
--
-- La comprobación va en las dos cláusulas de cada política que las admite.
-- `USING` decide qué filas se pueden tocar y `WITH CHECK` cómo pueden quedar:
-- sin la segunda, un administrador degradado a cliente en mitad de una sesión
-- todavía podría escribir.
create policy "administradores suben multimedia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'multimedia' and public.is_admin());

create policy "administradores leen multimedia"
  on storage.objects for select to authenticated
  using (bucket_id = 'multimedia' and public.is_admin());

create policy "administradores reemplazan multimedia"
  on storage.objects for update to authenticated
  using (bucket_id = 'multimedia' and public.is_admin())
  with check (bucket_id = 'multimedia' and public.is_admin());

create policy "administradores borran multimedia"
  on storage.objects for delete to authenticated
  using (bucket_id = 'multimedia' and public.is_admin());



-- ▼▼▼ 20260807001800_solicitudes_cambio_pin.sql ▼▼▼

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



-- ▼▼▼ 20260812001900_suscripciones_push.sql ▼▼▼

-- =============================================================================
-- 0020 · Suscripciones de notificaciones push
-- =============================================================================
-- El operador necesita enterarse de un pago en el momento, no cuando vuelve a
-- mirar el panel: el cliente ya pagó y está esperando su cuenta.
--
-- Se usa Web Push (el estándar del navegador) y no un canal externo porque la
-- aplicación ya es instalable en Android y iOS: la notificación llega al
-- teléfono igual que la de cualquier app, sin servidor extra ni terceros.
--
-- Una fila por navegador, no por usuario: el operador puede tener la aplicación
-- instalada en el móvil y abierta en el escritorio, y quiere el aviso en ambos.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.user_profiles (id) on delete cascade,

  -- La URL del servicio de push del navegador. Identifica la suscripción de
  -- forma única, así que es la clave natural para reconocer un alta repetida:
  -- el navegador devuelve la misma al volver a suscribirse y sin esto se
  -- acumularía una fila por cada visita a la pantalla.
  endpoint    text        not null unique,

  -- Claves del cifrado de la carga (RFC 8291). Sin ellas el mensaje no se puede
  -- cifrar y el navegador descarta el envío.
  p256dh      text        not null,
  auth        text        not null,

  -- Para saber qué dispositivo desactivar cuando hay varios.
  user_agent  text,

  created_at  timestamptz not null default now(),
  last_sent_at timestamptz
);

create index if not exists push_subscriptions_por_usuario
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- -----------------------------------------------------------------------------
-- Cada quien gestiona sus propias suscripciones
-- -----------------------------------------------------------------------------
-- Un endpoint ajeno en manos de otro usuario permitiría mandarle notificaciones
-- a su teléfono, así que la fila pertenece a quien la creó y nadie más la ve.
-- El envío real lo hace el servidor con la clave de servicio, que omite RLS.
-- -----------------------------------------------------------------------------
create policy "usuarios gestionan sus suscripciones push"
  on public.push_subscriptions for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

comment on table public.push_subscriptions is
  'Suscripciones de Web Push, una por navegador. El operador las usa para enterarse de los pagos en el momento.';



-- ▼▼▼ 20260813002000_reparar_solicitudes_cambio_pin.sql ▼▼▼

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



-- ▼▼▼ 20260813002100_renovaciones.sql ▼▼▼

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

