-- =============================================================================
-- 0026 · Contador de visitas
-- =============================================================================
-- Responde a la pregunta que ninguna herramienta externa contesta bien:
-- «entraron cuarenta personas y compraron tres». Vercel dice cuántas visitas
-- hubo y Supabase dice cuántas ventas; cruzar ambas cosas a mano cada semana no
-- se sostiene.
--
-- Qué se guarda y qué no:
--
--   · SÍ: la página, el país, de qué sitio venía y una marca de sesión.
--   · NO: dirección IP, cadena de navegador ni nada que identifique a nadie.
--
-- Esa marca de sesión (`session_id`) es un número aleatorio que genera el
-- navegador y vive en `sessionStorage`: se pierde al cerrar la pestaña. Sirve
-- para no contar diez visitas cuando alguien mira cinco páginas, y no permite
-- reconocer a la misma persona mañana. Sin IP ni huella, la tabla no contiene
-- datos personales y no hace falta banner de cookies.
-- =============================================================================

create table if not exists public.page_views (
  id          bigint generated always as identity primary key,

  -- La ruta, ya normalizada por el servidor. Nunca la URL completa: los
  -- parámetros pueden llevar códigos de invitación o identificadores.
  path        text        not null,

  -- Dos letras del país, de la cabecera que pone Vercel en el borde. Null
  -- cuando no la manda (desarrollo local, o un visitante tras cierta VPN).
  country     text,

  -- Sólo el dominio de origen, no la URL entera. «instagram.com» dice lo que
  -- hace falta saber; la URL completa a veces lleva identificadores de campaña
  -- que apuntan a una persona.
  referrer    text,

  -- Aleatorio, de sesión de navegador. Ver arriba.
  session_id  text        not null,

  created_at  timestamptz not null default now()
);

-- La consulta del panel es siempre «lo de los últimos N días agrupado por algo».
create index if not exists page_views_recientes
  on public.page_views (created_at desc);

create index if not exists page_views_por_sesion
  on public.page_views (session_id, created_at desc);

alter table public.page_views enable row level security;

-- -----------------------------------------------------------------------------
-- Sólo el operador las lee. Nadie las escribe desde el navegador.
-- -----------------------------------------------------------------------------
-- No hay política de INSERT a propósito: las filas las escribe el endpoint con
-- la clave de servicio, que omite RLS. Si hubiera una política de inserción para
-- `anon`, cualquiera podría inflar el contador con un bucle de peticiones desde
-- la consola del navegador.
-- -----------------------------------------------------------------------------
drop policy if exists "administradores leen las visitas" on public.page_views;
create policy "administradores leen las visitas"
  on public.page_views for select to authenticated
  using (public.is_admin());

comment on table public.page_views is
  'Visitas a las páginas públicas. Sin IP ni huella de navegador: no identifica a nadie.';

-- -----------------------------------------------------------------------------
-- Resumen para el panel
-- -----------------------------------------------------------------------------
-- Se resuelve en SQL y no en TypeScript porque son cuatro agregados sobre la
-- misma ventana de tiempo: traerse las filas al servidor de aplicación para
-- contarlas allí significaría mover miles de registros para devolver cuatro
-- números.
-- -----------------------------------------------------------------------------
create or replace function public.resumen_visitas(p_dias integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde     timestamptz;
  v_visitas   bigint;
  v_sesiones  bigint;
  v_paises    jsonb;
  v_paginas   jsonb;
  v_origenes  jsonb;
  v_registros bigint;
begin
  if not public.is_admin() then
    raise exception 'Sólo un administrador puede ver el resumen de visitas'
      using errcode = '42501';
  end if;

  v_desde := now() - make_interval(days => greatest(p_dias, 1));

  select count(*), count(distinct session_id)
    into v_visitas, v_sesiones
    from public.page_views
   where created_at >= v_desde;

  select coalesce(jsonb_agg(fila order by fila->>'total' desc), '[]'::jsonb)
    into v_paises
    from (
      select jsonb_build_object('country', coalesce(country, '??'), 'total', count(*)) as fila
        from public.page_views
       where created_at >= v_desde
       group by coalesce(country, '??')
       order by count(*) desc
       limit 12
    ) t;

  select coalesce(jsonb_agg(fila), '[]'::jsonb)
    into v_paginas
    from (
      select jsonb_build_object('path', path, 'total', count(*)) as fila
        from public.page_views
       where created_at >= v_desde
       group by path
       order by count(*) desc
       limit 10
    ) t;

  select coalesce(jsonb_agg(fila), '[]'::jsonb)
    into v_origenes
    from (
      select jsonb_build_object('referrer', referrer, 'total', count(*)) as fila
        from public.page_views
       where created_at >= v_desde
         and referrer is not null
       group by referrer
       order by count(*) desc
       limit 8
    ) t;

  -- Cuántos se registraron en la misma ventana. Es la mitad que convierte el
  -- contador en información útil: sin esto son visitas sueltas sin desenlace.
  select count(*)
    into v_registros
    from public.user_profiles
   where role = 'client'
     and created_at >= v_desde;

  return jsonb_build_object(
    'dias', p_dias,
    'visitas', v_visitas,
    'sesiones', v_sesiones,
    'registros', v_registros,
    'paises', v_paises,
    'paginas', v_paginas,
    'origenes', v_origenes
  );
end;
$$;

grant execute on function public.resumen_visitas(integer) to authenticated;
