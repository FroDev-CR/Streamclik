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
