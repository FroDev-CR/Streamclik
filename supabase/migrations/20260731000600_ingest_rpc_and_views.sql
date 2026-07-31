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
