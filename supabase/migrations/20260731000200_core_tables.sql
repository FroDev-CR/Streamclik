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
