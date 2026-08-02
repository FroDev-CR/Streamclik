-- =============================================================================
-- 0012 · Max en el catálogo público
-- =============================================================================
-- Se añade Max a ₡1 500 y se activa para que aparezca en la portada.
--
-- Los patrones de esta tabla son documentación del formato esperado, no la ruta
-- de extracción: hoy `pin_regex_patterns` NO se lee desde ningún sitio del
-- código. La única extracción real la hace el parser tipado de
-- `src/infrastructure/email/parsers/netflix.parser.ts`, y sólo hay uno.
--
-- Consecuencia que conviene tener escrita: un correo de Max se recibirá y se
-- guardará en `inbound_emails`, pero **no producirá ningún PIN**. El código
-- habrá que reenviarlo a mano hasta que exista `max.parser.ts`. Lo mismo aplica
-- a Disney+ y Prime Video.
-- =============================================================================

insert into public.streaming_services
  (slug, name, brand_color, sender_domains, pin_regex_patterns, pin_ttl_seconds,
   price_amount, price_currency, tagline, is_active)
values
  (
    'max',
    'Max',
    -- Violeta y no el azul real de la marca: en las piezas del catálogo Max
    -- aparece junto a Disney+ (#113CCF) y los dos azules se fundían en una sola
    -- mancha. El violeta los separa de un vistazo.
    '#6D28D9',
    array['max.com', 'hbomax.com', 'mail.max.com'],
    array['(?:código|codigo|code)[^0-9]{0,40}(\d{4,6})'],
    900,
    1500,
    'CRC',
    'Series de HBO, cine y documentales en un perfil sólo tuyo.',
    true
  )
on conflict (slug) do update
  set name               = excluded.name,
      brand_color        = excluded.brand_color,
      sender_domains     = excluded.sender_domains,
      pin_regex_patterns = excluded.pin_regex_patterns,
      pin_ttl_seconds    = excluded.pin_ttl_seconds,
      price_amount       = excluded.price_amount,
      price_currency     = excluded.price_currency,
      tagline            = excluded.tagline,
      is_active          = excluded.is_active;


-- -----------------------------------------------------------------------------
-- Precio de Netflix
-- -----------------------------------------------------------------------------
-- Baja de ₡3 500 a ₡3 000 por decisión comercial. El precio vive en la base de
-- datos justo para esto: cambiarlo es un UPDATE y no un despliegue.
--
-- Importa que quede aquí y no sólo en el panel: el catálogo, la pantalla de
-- compra y el importe que se congela en el pedido salen todos de esta columna.
-- Si la imagen promocional dice ₡3 000 y la web ₡3 500, la discusión con el
-- cliente la pierde el operador.
update public.streaming_services
   set price_amount = 3000
 where slug = 'netflix';


-- -----------------------------------------------------------------------------
-- Disney+ y Prime Video
-- -----------------------------------------------------------------------------
-- La semilla 0008 los dejó inactivos porque no había parser ni correos reales
-- con los que probar. Se activan ahora porque se están vendiendo: aparecen en el
-- catálogo con su disponibilidad real, que será cero mientras no haya cuentas
-- cargadas en el banco.
--
-- Se activan a sabiendas de que sus códigos no se extraen solos todavía. Es una
-- decisión de negocio, no un descuido: mientras no exista el parser, esos
-- códigos se reenvían a mano.
update public.streaming_services
   set is_active = true
 where slug in ('disney-plus', 'prime-video');
