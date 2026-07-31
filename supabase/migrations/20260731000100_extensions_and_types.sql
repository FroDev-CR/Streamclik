-- =============================================================================
-- 0001 · Extensiones y tipos enumerados
-- =============================================================================
-- Se definen todos los ENUM al principio para que el resto de migraciones sólo
-- añadan tablas. Un ENUM (frente a un CHECK sobre text) da validación a nivel de
-- motor, aparece en los tipos TypeScript generados por la CLI de Supabase y
-- documenta el dominio en el propio esquema.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext"   with schema extensions;

-- Rol de la plataforma. Deliberadamente mínimo: sólo hay operador y cliente.
-- Añadir 'reseller' más adelante es un `alter type ... add value`.
create type public.user_role as enum ('admin', 'client');

-- Ciclo de vida de una cuenta comprada por el operador.
create type public.account_status as enum ('active', 'suspended', 'expired');

-- Vigencia del contrato de un cliente sobre un perfil.
-- 'revoked' se conserva en lugar de borrar la fila: el historial de quién tuvo
-- acceso y hasta cuándo es exactamente lo que resuelve las disputas.
create type public.assignment_status as enum ('active', 'expired', 'revoked');

-- Tipo de código recibido. Netflix envía varios y el cliente necesita saber
-- cuál corresponde a la acción que acaba de intentar.
create type public.pin_code_type as enum (
  'household',       -- "Actualizar Hogar con Netflix" / Household verification
  'login',           -- Código de inicio de sesión temporal
  'signup',          -- Verificación de alta
  'password_reset',  -- Restablecimiento de contraseña
  'unknown'          -- Extraído, pero sin clasificar con confianza
);

-- Resultado del parsing. 'failed' y 'unmatched' no son lo mismo:
--   unmatched → no se encontró código (probablemente correo promocional)
--   failed    → el parser lanzó una excepción (bug que hay que corregir)
create type public.email_parse_status as enum ('parsed', 'unmatched', 'failed', 'ignored');

-- Canales de notificación. 'realtime' es el único implementado en el MVP;
-- el resto existe para que el outbox y las preferencias ya los contemplen.
create type public.notification_channel as enum ('realtime', 'whatsapp', 'telegram', 'push', 'email');

create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');
