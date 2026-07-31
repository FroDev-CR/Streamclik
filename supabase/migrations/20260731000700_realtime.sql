-- =============================================================================
-- 0007 · Realtime
-- =============================================================================
-- Supabase Realtime lee el WAL de Postgres y evalúa las políticas RLS por
-- suscriptor: cada cliente recibe únicamente las filas que su política le
-- permitiría leer con un SELECT. Es lo que hace que la entrega de PIN en vivo sea
-- segura sin ninguna lógica de autorización adicional en el cliente.
-- =============================================================================

alter publication supabase_realtime add table public.verification_pins;

-- REPLICA IDENTITY FULL incluye la fila completa en el WAL. Es necesario porque
-- la política de verification_pins filtra por `account_id` y `received_at`: con
-- la identidad por defecto (sólo la clave primaria) Realtime no tendría esas
-- columnas disponibles para evaluar RLS ni para aplicar el filtro del canal.
--
-- Coste: más volumen de WAL. Aceptable en esta tabla, cuyas filas son pequeñas y
-- de escritura poco frecuente (unos pocos códigos por cuenta y día).
alter table public.verification_pins replica identity full;

-- Las asignaciones también se emiten: permite que el dashboard de un cliente
-- reaccione en el momento en que un administrador le concede o revoca acceso,
-- sin recargar la página.
alter publication supabase_realtime add table public.profile_assignments;
alter table public.profile_assignments replica identity full;
