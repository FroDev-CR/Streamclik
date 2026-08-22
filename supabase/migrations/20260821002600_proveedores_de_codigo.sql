-- =============================================================================
-- 0027 · Cuentas con proveedor externo de códigos
-- =============================================================================
-- Las cuentas de Disney+ se las compramos a GoPlay y el buzón es suyo. El correo
-- de verificación nunca pasa por streamclick.xyz, así que el pipeline de correo
-- entrante —que espera que Cloudflare le empuje el mensaje— no puede verlo.
--
-- Lo que cambia es de dónde sale el correo, no lo que se hace con él: se pide a
-- la API de GoPlay y desde ahí sigue exactamente el mismo camino, incluida la
-- ingesta por `ingest_inbound_email`. Por eso esta migración es tan corta: dos
-- columnas y nada más.
--
-- La decisión que ahorra todo lo demás: **`inbox_email` sigue siendo la llave**.
-- Para una cuenta de GoPlay se guarda ahí la dirección del buzón de ellos (la
-- que aparece como «Cuenta Digital» en su panel). Así el RPC resuelve la cuenta
-- igual que siempre, la idempotencia por `message_id` sigue en pie y no hace
-- falta un segundo camino de ingesta que habría que mantener en paralelo.
--
-- ⚠️ GoPlay entrega cada correo UNA SOLA VEZ: al devolverlo lo marca como leído
-- y después contesta «Este mensaje ya fue leido». Quien consulte tiene que
-- persistir el código antes de hacer nada más, porque no hay segunda
-- oportunidad. Detalle en docs/12-codigos-de-goplay.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- De dónde llega el código de esta cuenta
-- -----------------------------------------------------------------------------
-- Se modela como texto con CHECK y no como enum: añadir un proveedor nuevo a un
-- enum obliga a `alter type` fuera de transacción en algunas versiones, y aquí
-- el conjunto de valores es pequeño y de crecimiento lento.
-- -----------------------------------------------------------------------------
alter table public.streaming_accounts
  add column if not exists code_provider text not null default 'propio',
  add column if not exists provider_profile_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'streaming_accounts_code_provider_valido'
  ) then
    alter table public.streaming_accounts
      add constraint streaming_accounts_code_provider_valido
      check (code_provider in ('propio', 'goplay'));
  end if;
end $$;

-- Una cuenta con proveedor externo sin identificador de perfil es una cuenta que
-- nunca podrá entregar un código: se prohíbe en la base y no sólo en el
-- formulario, que es donde de verdad se sostienen las invariantes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'streaming_accounts_proveedor_exige_perfil'
  ) then
    alter table public.streaming_accounts
      add constraint streaming_accounts_proveedor_exige_perfil
      check (
        code_provider = 'propio'
        or (provider_profile_id is not null and length(trim(provider_profile_id)) > 0)
      );
  end if;
end $$;

comment on column public.streaming_accounts.code_provider is
  'De dónde se obtiene el código: propio (buzón nuestro, el correo llega solo) o goplay (buzón del proveedor, hay que ir a pedirlo).';

comment on column public.streaming_accounts.provider_profile_id is
  'Identificador del perfil en el proveedor. En GoPlay es un UUID, no un número: por eso la columna es text.';

-- -----------------------------------------------------------------------------
-- La vista del dashboard expone el proveedor
-- -----------------------------------------------------------------------------
-- La pantalla del cliente necesita saberlo para decidir si ofrece el botón de
-- «pedir mi código». Sin esto tendría que hacer una segunda consulta a
-- `streaming_accounts`, que RLS le negaría: un cliente no puede leer esa tabla
-- directamente, y es correcto que no pueda —contiene credenciales—.
--
-- `provider_profile_id` NO se expone. El cliente no lo necesita para nada y es
-- un identificador de nuestro proveedor: la Server Action lo resuelve en el
-- servidor a partir del identificador de la cuenta.
--
-- ⚠️ Se hace DROP + CREATE y no `create or replace view`. Postgres sólo deja
-- **añadir columnas al final** con `replace`: insertar una en medio lo
-- interpreta como renombrar la que ocupaba esa posición y falla con
--
--   42P16: cannot change name of view column "service_slug" to "code_provider"
--
-- El editor de Supabase ejecuta el archivo en una sola transacción, así que ese
-- error deshace también los `alter table` de arriba y la migración parece no
-- haber hecho nada. Poner la columna al final habría evitado el error, pero deja
-- el orden de la vista contando la historia de cómo se fue parcheando en vez de
-- cómo se lee.
-- -----------------------------------------------------------------------------
drop view if exists public.v_my_accounts;

create view public.v_my_accounts
with (security_invoker = true)
as
select
  acc.id                as account_id,
  acc.label             as account_label,
  acc.login_email,
  acc.login_password_enc,
  acc.status            as account_status,
  acc.code_provider,
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

grant select on public.v_my_accounts to authenticated;

-- -----------------------------------------------------------------------------
-- Cómo se conecta una cuenta existente con GoPlay
-- -----------------------------------------------------------------------------
-- El `provider_profile_id` sale de `npm run diagnostico:goplay`, que lista el de
-- cada cuenta. El `inbox_email` es la «Cuenta Digital» de su panel.
--
--   update public.streaming_accounts
--      set code_provider       = 'goplay',
--          provider_profile_id = '00000000-0000-0000-0000-000000000000',
--          inbox_email         = 'correo-de-la-cuenta@proveedor.com'
--    where label = 'Disney 01';
--
-- No se hace aquí a propósito: una migración con datos de un cliente concreto
-- deja de ser reproducible en otra instalación.
-- -----------------------------------------------------------------------------
