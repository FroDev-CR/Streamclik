# Esquema de base de datos

Fuente de verdad: `supabase/migrations/`. Este documento explica el *porqué* de
cada tabla; el SQL explica el *cómo*.

## 1. Diagrama entidad-relación

```
auth.users (Supabase Auth)
    │ 1:1
    ▼
user_profiles ──────────────┐
  id (PK, FK auth.users)    │ assigned_user_id
  role: admin | client      │
  full_name, phone          │
  telegram_chat_id          │
                            │
streaming_services          │
  id (PK)                   │
  slug: netflix             │
  pin_regex_patterns[]      │
  sender_domains[]          │
    │ 1:N                   │
    ▼                       │
streaming_accounts          │
  id (PK)                   │
  service_id (FK)           │
  inbox_email (UNIQUE)  ◄───┼── netflix1@streamclick.com
  login_email               │
  login_password_enc        │
  max_profiles, status      │
    │ 1:N                   │
    ▼                       │
account_profiles            │
  id (PK)                   │
  account_id (FK)           │
  label: "Perfil 1"         │
  profile_pin               │
    │ 1:N                   │
    ▼                       │
profile_assignments ◄───────┘
  id (PK)
  account_profile_id (FK)
  user_id (FK user_profiles)
  starts_at, expires_at, status

streaming_accounts
    │ 1:N                      1:N
    ├──────────► inbound_emails ──────► verification_pins
    │              message_id (UNIQUE)    code, code_type
    │              raw_payload            received_at, expires_at
    │              parse_status
    │
    └──────────► notification_outbox
                   channel, payload, attempts, status

audit_logs  (quién vio qué PIN y cuándo)
```

## 2. Tablas

### 2.1 `user_profiles`

Extiende `auth.users`. Supabase no permite añadir columnas a `auth.users`, así que
el patrón canónico es una tabla espejo en `public` poblada por trigger
`on_auth_user_created`.

| Columna | Tipo | Nota |
| --- | --- | --- |
| `id` | `uuid` PK | = `auth.users.id`, `ON DELETE CASCADE` |
| `role` | `user_role` | `admin` \| `client`. Default `client`. |
| `full_name`, `phone` | `text` | Contacto |
| `telegram_chat_id` | `text` | Preparado para la integración futura |
| `notification_preferences` | `jsonb` | `{"realtime":true,"whatsapp":false,…}` |

**Decisión:** el rol vive en la tabla, no en el JWT. Revocar admin es un `UPDATE`
con efecto inmediato; con un claim en el JWT habría que esperar a que expire el
token. Coste: un join extra, resuelto con la función `is_admin()` marcada
`STABLE` para que Postgres la cachee dentro de la consulta.

### 2.2 `streaming_services`

Catálogo. Netflix es la primera fila, pero el pipeline es genérico desde el día
uno porque añadir Disney+ después es inevitable.

Guarda `pin_regex_patterns text[]` y `sender_domains text[]`. Los patrones de la
BD sirven como *fallback configurable en caliente*: si Netflix cambia el formato
del correo un domingo, se corrige con un `UPDATE` sin redesplegar. El parser
tipado en TypeScript sigue siendo la ruta principal (más preciso y testeado).

### 2.3 `streaming_accounts`

El activo que el operador compra y revende.

| Columna | Nota |
| --- | --- |
| `inbox_email` | **UNIQUE**, normalizado en minúsculas. Es la llave de enrutamiento del webhook: `netflix1@streamclick.com`. |
| `login_email` / `login_password_enc` | Credenciales que el cliente usa en Netflix. Ver nota de seguridad abajo. |
| `max_profiles` | Tope de perfiles vendibles (Netflix estándar: 5). |
| `status` | `active` \| `suspended` \| `expired`. |
| `owner_id` | Admin propietario — prepara multi-tenant real. |

**Nota de seguridad sobre credenciales:** en este negocio el cliente necesita las
credenciales para iniciar sesión, así que no pueden ser un hash. Se almacenan
cifradas y el acceso se restringe por RLS a los usuarios con asignación activa.
El MVP usa el sufijo `_enc` y una capa de cifrado en la aplicación como contrato;
la ruta recomendada en producción es `pgsodium`/Supabase Vault. Está registrado
como deuda técnica explícita en ADR-0007 en lugar de fingir que está resuelto.

### 2.4 `account_profiles` y `profile_assignments`

Se separan a propósito. `account_profiles` es el **slot físico** dentro de la
cuenta de Netflix (existe aunque nadie lo tenga contratado). `profile_assignments`
es el **contrato temporal** de un cliente sobre ese slot.

Modelarlo como una sola tabla con `user_id` nullable parecía más simple, pero
rompe dos cosas: el historial de quién tuvo el perfil antes, y la capacidad de
programar una renovación futura. Un índice único parcial garantiza la invariante:

```sql
CREATE UNIQUE INDEX one_active_assignment_per_profile
  ON profile_assignments (account_profile_id)
  WHERE status = 'active';
```

Es la invariante de negocio más importante del sistema y por eso vive en la base
de datos, no en el caso de uso: dos peticiones concurrentes pueden pasar la misma
validación en el código, pero no el mismo índice único.

### 2.5 `inbound_emails`

Registro crudo de cada correo recibido. Existe por tres razones:

1. **Idempotencia** — `message_id` es UNIQUE. El proveedor reintenta ante un 500;
   el `ON CONFLICT DO NOTHING` evita PIN duplicados.
2. **Depuración** — cuando un parser falla, `parse_status = 'failed'` y el cuerpo
   queda guardado para escribir el test de regresión con el correo real.
3. **Auditoría** — prueba de qué llegó y cuándo.

`raw_payload jsonb` se retiene por tiempo limitado (política de purga sugerida:
30 días) porque contiene datos personales.

### 2.6 `verification_pins`

El producto final del pipeline.

| Columna | Nota |
| --- | --- |
| `code` | El PIN extraído (4–6 dígitos). |
| `code_type` | `household` \| `login` \| `signup` \| `password_reset` \| `unknown`. Netflix envía varios tipos y el cliente necesita saber cuál pidió. |
| `received_at` | Momento del correo, no del insert. |
| `expires_at` | `received_at + 15 min` por defecto; la UI muestra cuenta atrás. |
| `action_url` | Enlace "Sí, fui yo" cuando el correo lo trae. |

**Decisión de privacidad:** un cliente solo ve PIN cuyo `received_at` cae dentro
de la ventana de su asignación activa. Sin esa condición, un cliente nuevo vería
el historial completo del inquilino anterior. La condición está en la política
RLS, no en el `WHERE` de la consulta — así también aplica a Realtime.

### 2.7 `notification_outbox`

Patrón *transactional outbox*. La ingesta no llama a WhatsApp de forma síncrona:
inserta una fila en el outbox dentro de la misma transacción que el PIN. Un worker
la consume después.

Por qué importa: si el webhook llamara a la API de WhatsApp en línea y esa API
tardara 8 segundos o fallara, el proveedor de correo daría timeout y reintentaría,
duplicando trabajo. Con outbox, el webhook responde en milisegundos y la entrega
se reintenta con backoff independientemente.

### 2.8 `audit_logs`

Quién vio qué PIN y cuándo. En un negocio de cuentas compartidas, la disputa
típica es "alguien más usó mi perfil". Este registro la resuelve.

## 3. Estrategia de Row Level Security

RLS está activo (`ENABLE ROW LEVEL SECURITY`) en **todas** las tablas de `public`,
incluidas las de catálogo. Sin políticas, el default es denegar todo, que es la
postura correcta.

### 3.1 Funciones auxiliares

Las políticas no consultan las tablas directamente porque eso genera **recursión
infinita de RLS** (la política de A consulta B, cuya política consulta A). Se usan
funciones `SECURITY DEFINER` con `search_path` fijado:

```sql
public.is_admin(uid uuid) → boolean
public.has_account_access(account uuid, uid uuid) → boolean
public.assignment_window(account uuid, uid uuid) → tstzrange
```

`SECURITY DEFINER` ejecuta con los permisos del creador y salta RLS dentro de la
función. Es potente y por eso se blinda con `SET search_path = public, pg_temp`,
que evita el ataque clásico de sustituir una tabla por otra en un esquema
controlado por el atacante.

### 3.2 Matriz de acceso

| Tabla | Cliente | Admin |
| --- | --- | --- |
| `user_profiles` | SELECT/UPDATE su fila | Todo |
| `streaming_services` | SELECT | Todo |
| `streaming_accounts` | SELECT si tiene asignación activa | Todo |
| `account_profiles` | SELECT sus perfiles asignados | Todo |
| `profile_assignments` | SELECT sus asignaciones | Todo |
| `verification_pins` | SELECT si asignación activa **y** dentro de la ventana temporal | Todo |
| `inbound_emails` | Sin acceso | SELECT |
| `notification_outbox` | Sin acceso | SELECT |
| `audit_logs` | INSERT propio | SELECT |

Nadie escribe en `verification_pins` con rol `authenticated`. Solo la
`service_role` desde el webhook. Un cliente no puede inventarse un PIN.

## 4. Realtime

Realtime de Supabase aplica RLS a los eventos `postgres_changes` para clientes
autenticados: cada suscriptor recibe únicamente las filas que su política le
permitiría leer con un `SELECT`. Esto es lo que hace que "PIN en vivo" sea seguro
sin lógica adicional en el cliente.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.verification_pins;
ALTER TABLE public.verification_pins REPLICA IDENTITY FULL;
```

`REPLICA IDENTITY FULL` es necesario para que el filtrado por RLS disponga de
todas las columnas de la fila en el WAL.

El cliente además filtra por `account_id=eq.<uuid>` para no despertar el
componente con PIN de otras cuentas suyas. Ese filtro es una optimización de
rendimiento; la garantía de seguridad la sigue dando RLS.

## 5. Índices

| Índice | Justificación |
| --- | --- |
| `streaming_accounts (lower(inbox_email))` UNIQUE | Enrutamiento del webhook: es la consulta más caliente del pipeline. |
| `verification_pins (account_id, received_at DESC)` | "Último PIN" y el historial paginado. |
| `profile_assignments (user_id) WHERE status='active'` | Consulta del dashboard en cada carga. |
| `inbound_emails (message_id)` UNIQUE | Idempotencia. |
| `notification_outbox (status, next_attempt_at)` | Barrido del worker. |

## 6. Vistas

`v_my_accounts` y `v_latest_pins` se declaran con `security_invoker = true`, de
modo que las políticas RLS del usuario que consulta siguen aplicando. Una vista
normal en Postgres corre con los permisos del *creador*, lo que abriría un hueco
silencioso; `security_invoker` es obligatorio aquí y es un error fácil de cometer.
