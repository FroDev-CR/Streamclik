-- =============================================================================
-- 0008 · Semilla del catálogo de servicios
-- =============================================================================
-- Idempotente (ON CONFLICT sobre el slug) para poder ejecutarse en cada
-- `supabase db reset` sin duplicar filas.
--
-- Los patrones de esta tabla son el respaldo configurable en caliente. La ruta
-- principal de extracción es el parser tipado de
-- src/infrastructure/email/parsers/netflix.parser.ts, que además clasifica el
-- tipo de código. Estos patrones permiten reaccionar en minutos si Netflix
-- cambia el formato del correo, sin necesidad de desplegar.
-- =============================================================================

insert into public.streaming_services
  (slug, name, brand_color, sender_domains, pin_regex_patterns, pin_ttl_seconds)
values
  (
    'netflix',
    'Netflix',
    '#E50914',
    array['netflix.com', 'members.netflix.com', 'account.netflix.com'],
    array[
      -- Anclados a contexto y en orden de especificidad. Importa: los correos de
      -- Netflix contienen otros números (año del pie de página, importes), y un
      -- \d{4,6} suelto extraería "2026" con total alegría.
      '(?:código|codigo|code)[^0-9]{0,40}(\d{4,6})',
      '(?:verification code|código de verificación)[^0-9]{0,40}(\d{4,6})',
      '(\d{4,6})[^0-9]{0,30}(?:es tu código|is your code)'
    ],
    900   -- Netflix: 15 minutos
  ),
  (
    'disney-plus',
    'Disney+',
    '#113CCF',
    array['disneyplus.com', 'mail.disneyplus.com'],
    array['(?:one-time passcode|código de acceso)[^0-9]{0,40}(\d{6})'],
    900
  ),
  (
    'prime-video',
    'Prime Video',
    '#00A8E1',
    array['amazon.com', 'primevideo.com'],
    array['(?:OTP|código)[^0-9]{0,40}(\d{6})'],
    600
  )
on conflict (slug) do update
  set name               = excluded.name,
      brand_color        = excluded.brand_color,
      sender_domains     = excluded.sender_domains,
      pin_regex_patterns = excluded.pin_regex_patterns,
      pin_ttl_seconds    = excluded.pin_ttl_seconds;

-- Disney+ y Prime Video quedan inactivos: el catálogo está listo, pero sin
-- parser tipado y sin correos reales con los que hacer tests, activarlos sólo
-- produciría PIN mal extraídos.
update public.streaming_services
   set is_active = false
 where slug in ('disney-plus', 'prime-video');
