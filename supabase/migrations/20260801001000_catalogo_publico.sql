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
