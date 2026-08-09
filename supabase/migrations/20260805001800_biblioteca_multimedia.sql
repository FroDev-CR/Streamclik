-- =============================================================================
-- 0018 · Biblioteca multimedia del operador
-- =============================================================================
-- Un respaldo propio para las piezas de publicidad: subir imágenes y vídeos,
-- verlos y descargarlos desde el panel, sin depender de Drive.
--
-- No lleva tabla de metadatos a propósito. El listado sale del propio bucket, y
-- así no existe la divergencia clásica de este patrón: una fila que dice que un
-- archivo existe cuando ya se borró, o un archivo huérfano que no aparece en
-- ninguna parte. Storage es la única fuente de verdad.
--
-- La separación entre imágenes y vídeos también es del bucket: cada archivo va
-- bajo `imagenes/` o `videos/`. Es una carpeta, no una columna, así que no puede
-- desincronizarse del contenido real.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · El bucket
-- -----------------------------------------------------------------------------
-- Privado. Aunque sean piezas pensadas para publicarse, un bucket abierto deja
-- accesible por URL **todo** lo que se suba, incluidos los borradores y lo que
-- se subió por error. Se sirve con URL firmada, igual que los comprobantes.
--
-- 50 MB por archivo: es el techo por defecto de un proyecto de Supabase. Subirlo
-- aquí sin subirlo también en la configuración del proyecto no serviría de nada
-- —manda el menor de los dos—, así que se deja alineado con el límite real.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'multimedia',
  'multimedia',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;


-- -----------------------------------------------------------------------------
-- 2 · Sólo el administrador
-- -----------------------------------------------------------------------------
-- Las cuatro operaciones exigen `is_admin()`. No hay política para clientes:
-- sin política, el comportamiento por defecto de RLS es denegar, que es
-- exactamente lo que se quiere aquí.
--
-- La comprobación va en las dos cláusulas de cada política que las admite.
-- `USING` decide qué filas se pueden tocar y `WITH CHECK` cómo pueden quedar:
-- sin la segunda, un administrador degradado a cliente en mitad de una sesión
-- todavía podría escribir.
create policy "administradores suben multimedia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'multimedia' and public.is_admin());

create policy "administradores leen multimedia"
  on storage.objects for select to authenticated
  using (bucket_id = 'multimedia' and public.is_admin());

create policy "administradores reemplazan multimedia"
  on storage.objects for update to authenticated
  using (bucket_id = 'multimedia' and public.is_admin())
  with check (bucket_id = 'multimedia' and public.is_admin());

create policy "administradores borran multimedia"
  on storage.objects for delete to authenticated
  using (bucket_id = 'multimedia' and public.is_admin());
