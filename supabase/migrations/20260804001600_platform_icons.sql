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
