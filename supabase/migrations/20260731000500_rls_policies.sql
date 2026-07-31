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
