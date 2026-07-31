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
