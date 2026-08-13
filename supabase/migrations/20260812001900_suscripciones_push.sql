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
-- `drop` antes de `create`: sin él, volver a aplicar esta migración falla con
-- «policy already exists» y deja el resto del archivo sin ejecutar.
drop policy if exists "usuarios gestionan sus suscripciones push" on public.push_subscriptions;
create policy "usuarios gestionan sus suscripciones push"
  on public.push_subscriptions for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

comment on table public.push_subscriptions is
  'Suscripciones de Web Push, una por navegador. El operador las usa para enterarse de los pagos en el momento.';
