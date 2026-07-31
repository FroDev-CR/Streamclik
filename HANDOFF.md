# Traspaso de contexto — StreamClick

> **Léeme primero.** Este documento existe para que una sesión nueva (Cowork,
> Claude Code o cualquier agente) arranque en frío con todo el contexto del
> proyecto: qué es, qué está construido, qué decisiones se tomaron y por qué, qué
> trampas ya se pisaron y qué queda pendiente.
>
> Última actualización: 2026-07-31 · Commit `a255eb1`

---

## 1. Qué es StreamClick

SaaS para revendedores de cuentas compartidas de streaming (Netflix como primer
servicio).

**El problema real que resuelve:** Netflix envía códigos de verificación
temporales al correo *dueño* de la cuenta, que controla el operador y no el
cliente final. Sin automatización, el operador reenvía cada código a mano por
WhatsApp mientras el código expira en 15 minutos.

**Lo que hace la plataforma:** recibe el correo → extrae el PIN con expresiones
regulares → lo entrega en tiempo real al cliente que tiene ese perfil asignado, y
sólo a él.

**Dominio de producción:** `streamclick.xyz` (propiedad del usuario).
**Repositorio:** `FroDev-CR/Streamclik`.
**Rama de trabajo:** `claude/streamclick-saas-architecture-ad9wlm` — todo el
desarrollo va aquí, nunca a la rama principal sin permiso explícito.

---

## 2. Estado actual

| Aspecto | Estado |
| --- | --- |
| Código del MVP | ✅ Completo |
| Tests | ✅ 32 en verde (4 archivos) |
| Typecheck | ✅ `tsc --noEmit` sin errores |
| Lint | ✅ Sin avisos |
| Build de producción | ✅ Correcto sin variables de entorno |
| **Desplegado en Vercel** | ❌ **No. El usuario está a punto de hacerlo.** |
| **Proyecto de Supabase** | ❌ **No creado todavía** |
| **Email Worker desplegado** | ❌ **No** |

**El usuario va por el paso 1 de [`docs/06-despliegue.md`](docs/06-despliegue.md).**
Si retoma la conversación, lo más probable es que pregunte por un problema
concreto de ese runbook. Empieza por ahí.

### Commits

```
a255eb1  Añadir el paquete de despliegue: correo entrante, SQL de instalación y runbook
635f6fc  Implementar StreamClick: SaaS de cuentas compartidas de streaming
```

112 archivos versionados · 66 de código TypeScript · 8 migraciones SQL.

---

## 3. Stack y versiones reales instaladas

| Pieza | Versión | Nota |
| --- | --- | --- |
| Node | 22.x | |
| Next.js | 15.5.22 | App Router |
| React | 19.2.8 | |
| TypeScript | 5.7 | `strict` + `noUncheckedIndexedAccess` |
| Tailwind CSS | 4.3.3 | v4: sin `tailwind.config.js`, el tema va en `globals.css` |
| `@supabase/supabase-js` | 2.111.0 | |
| `@supabase/ssr` | **0.12.4** | ⚠️ **No bajar de 0.12** — ver §6.1 |
| Vitest | 2.1.9 | |

---

## 4. Mapa del repositorio

```
src/
├── app/                        # Rutas. Las páginas son delgadas por diseño.
│   ├── (auth)/                 # login · registro · recuperar
│   ├── (dashboard)/            # dashboard · cuenta/[id] · admin
│   │   └── layout.tsx          # ⚠️ export const dynamic = 'force-dynamic'
│   ├── auth/confirm/route.ts   # canjea el token del correo por sesión
│   └── api/webhooks/inbound-email/route.ts   # ⭐ entrada del pipeline
│
├── core/                       # ⚠️ NO importar Next ni Supabase aquí
│   ├── domain/                 # entidades (objetos planos) + value objects
│   ├── ports/                  # interfaces: EmailParser, repositorios, NotificationSender
│   ├── shared/                 # Result<T,E>, DomainError
│   └── use-cases/              # ProcessInboundEmail, AssignProfile, RevokeAssignment
│
├── infrastructure/
│   ├── supabase/               # server.ts · client.ts · admin.ts · middleware.ts · database.types.ts
│   ├── email/parsers/          # ⭐ netflix.parser.ts — el núcleo del valor
│   ├── email/providers/        # verificación HMAC + normalización por proveedor
│   ├── repositories/           # implementaciones sobre Supabase
│   ├── crypto/                 # cifrado de credenciales (AES-256-GCM)
│   └── container.ts            # composition root — única fábrica de dependencias
│
├── features/                   # UI por módulo vertical: auth · accounts · pins · admin
├── components/ui/              # design system: Button, Card, Badge, Input
└── lib/                        # env (zod) · logger · utils · rate-limit

supabase/migrations/            # 8 migraciones — fuente de verdad del esquema
supabase/setup.sql              # las 8 concatenadas (generado, no editar a mano)
workers/inbound-email/          # Email Worker de Cloudflare (proyecto npm aparte)
docs/                           # arquitectura, esquema, flujos, despliegue
docs/adr/                       # 7 decisiones registradas con su justificación
tests/                          # Vitest
```

**Regla de revisión mecánica:** `grep -r "@supabase\|next/" src/core/` debe salir
vacío. Si algo aparece ahí, la arquitectura está contaminada.

---

## 5. Decisiones que NO hay que deshacer

Están documentadas a fondo en `docs/adr/`. El resumen de por qué existen:

### 5.1 La autorización vive en RLS, no en el código (ADR-0003)

**Es la decisión central del proyecto.** Row Level Security está activo en las 9
tablas. Un `WHERE user_id = $1` en un repositorio protegería sólo ese camino de
código; RLS protege además las suscripciones de Realtime y cualquier llamada
directa a la API PostgREST con un JWT robado (la URL y la `anon key` son públicas
por diseño).

Corolario práctico: **si un agente futuro "arregla" una consulta añadiendo
filtros de seguridad en TypeScript, no está mejorando nada** — el filtro ya está
en Postgres. Lo que sí importa es no romper las políticas.

Detalle de privacidad fácil de perder: un cliente sólo ve PIN cuyo `received_at`
cae **dentro de la ventana de su asignación**. Sin esa condición vería el
historial del inquilino anterior. Está en `can_view_pin()`.

### 5.2 Clean Architecture en `core/`, módulos verticales en `features/` (ADR-0002)

Dos ejes con propósitos distintos: `core/` organiza por capa (regla de
dependencia estricta), `features/` por módulo de UI (cohesión de pantallas).

### 5.3 Las lecturas simples NO pasan por casos de uso (ADR-0006)

Un caso de uso que sólo hace `return repo.findAll(userId)` es indirección sin
propósito. Las escrituras y la lógica con invariantes sí tienen caso de uso; las
lecturas de presentación consultan directo desde el Server Component vía
`features/*/queries.ts`. **No "completar" esto añadiendo casos de uso de lectura.**

### 5.4 Server Actions para el usuario, Route Handlers para máquinas (ADR-0005)

El único endpoint HTTP público es el webhook de correo (más `/api/health`). Todo
lo demás son Server Actions. Cada Server Action empieza con `requireUser()` o
`requireAdmin()` porque **una Server Action es un endpoint POST público**.

### 5.5 Tres clientes de Supabase, nunca mezclados (ADR-0004)

| Fichero | Clave | RLS |
| --- | --- | --- |
| `supabase/server.ts` | `anon` + cookies | ✅ aplica |
| `supabase/client.ts` | `anon` | ✅ aplica |
| `supabase/admin.ts` | `service_role` | ❌ **la omite** |

`admin.ts` se usa **exclusivamente** en el webhook de ingesta. Importa
`server-only` para que el build falle si algo lo arrastra a un bundle de cliente.

---

## 6. Trampas ya pisadas (no reintroducir)

Esta sección es la más valiosa de todo el documento. Cada punto costó un ciclo de
depuración.

### 6.1 `@supabase/ssr` < 0.12 rompe TODOS los tipos

Con `@supabase/ssr` 0.5.2 y `supabase-js` 2.111, `createServerClient<Database>()`
devuelve un cliente cuyo schema se resuelve como `never`. El síntoma son decenas
de errores del tipo:

```
Property 'email' does not exist on type 'never'.
```

…en los ficheros que *consultan*, no donde está la causa. `createClient` de
supabase-js funcionaba bien; sólo fallaba el de `ssr`. **Solución: `@supabase/ssr`
≥ 0.12.4.** No bajarlo.

### 6.2 El tipo `Database` escrito a mano tiene una forma obligatoria

`src/infrastructure/supabase/database.types.ts` está escrito a mano para que el
repo compile sin una instancia de Supabase. `postgrest-js` sólo lo reconoce si:

- cada **tabla** declara `Row`, `Insert`, `Update` **y `Relationships`**
- cada **vista** declara al menos `Row` y `Relationships`
- `Update` nunca es `never` (usar `Record<string, never>` para tablas inmutables)

Si falta cualquiera de esas claves, el esquema deja de encajar en `GenericSchema`
y **todo** vuelve a resolverse como `never`. Mismo síntoma que §6.1, causa
distinta.

Cuando haya una base de datos real: `npm run db:types` regenera el fichero
correctamente y este problema desaparece.

### 6.3 Las rutas con sesión deben ser `force-dynamic` explícito

`src/app/(dashboard)/layout.tsx` declara `export const dynamic = 'force-dynamic'`.

Sin esa línea, el build **funciona si existe `.env.local` y falla si no**: durante
el intento de prerenderizado se evalúa `getServerEnv()` (que lanza) antes de
llegar al acceso a `cookies()` que provocaría el bailout a dinámico. El error que
se ve es un `prerender-error` de `/admin` que no señala la causa real.

Además es semánticamente correcto: una página de dashboard prerenderizada sería
el dashboard de *alguien*, servido a todo el mundo.

### 6.4 Los patrones del parser necesitan un hueco entre el ancla y el código

El correo real de Netflix dice **"Tu código *de acceso temporal es* 4821"** — 22
caracteres entre el literal y el número. Los primeros patrones exigían el código
casi pegado a "código" y fallaban con el correo más habitual del sistema.

La solución es `GAP = [^\d]{0,40}` en `netflix.parser.ts`. No puede tragarse el
propio código porque `[^\d]` no casa con dígitos, así que la expansión codiciosa
se detiene sola en el primer número.

### 6.5 Hay que probar los DOS cuerpos del correo, no elegir uno

Un heurístico de "usa `text` si mide más de 40 caracteres" descartaba el HTML en
correos donde la parte de texto era un stub. Ahora se prueban `text` y luego el
HTML convertido, en orden. Netflix a menudo envía **sólo** HTML.

### 6.6 Los años del pie de página parecen códigos

`PinCode.isPlausibleCode()` descarta números de 4 dígitos entre 1990 y 2100 y
secuencias de dígitos iguales (`0000`). Sin ese filtro, el patrón genérico extrae
"2026" del copyright con total confianza y el cliente recibe un código que no
funciona — **peor que no recibir nada**, porque parece correcto.

### 6.7 La firma del Worker y la de la app deben coincidir byte a byte

El Email Worker firma con **Web Crypto**; la aplicación verifica con
**node:crypto**. Si divergen, el webhook responde 401 y **ningún código llega
jamás**, sin que ningún test de la app lo detecte.

`tests/worker-signature-compat.test.ts` reproduce la firma del Worker
exactamente, incluyendo tildes y la eñe (una diferencia de codificación sólo
fallaría con los correos reales en español, no con los de prueba). **Si se toca
`hmacSha256Hex()` en el Worker, hay que tocar también ese test.**

### 6.8 `server-only` rompe Vitest

`vitest.config.ts` aliasa `server-only` al `empty.js` del propio paquete. Sin eso,
cualquier test que importe código de servidor falla con *"This module cannot be
imported from a Client Component module"*.

### 6.9 Otros detalles de Next 15 ya resueltos

- `cookies()`, `params` y `searchParams` son **promesas** — hay que hacer `await`.
- `redirect()` lanza `NEXT_REDIRECT` por diseño: **llamarlo siempre fuera del
  `try`**, o el `catch` se lo traga y el formulario no navega.
- El middleware debe devolver **el mismo objeto `NextResponse`** que recibió el
  cliente de Supabase, o se pierde el token refrescado (síntoma: sesión que se
  cae cada hora, invisible en desarrollo).
- Usar `getUser()` y no `getSession()` en el middleware: el segundo no verifica la
  firma de la cookie contra el servidor de Auth.

---

## 7. El pipeline correo → PIN

Es el corazón del producto. Detalle completo en
[`docs/04-flujo-email-a-pin.md`](docs/04-flujo-email-a-pin.md).

```
Netflix envía a netflix1@streamclick.xyz
   ↓
Cloudflare Email Routing (catch-all *@streamclick.xyz)
   ↓
Email Worker (workers/inbound-email/) — parsea MIME, firma HMAC, POST
   ↓
POST /api/webhooks/inbound-email  (runtime nodejs)
   1. verifica firma HMAC en tiempo constante + ventana de 5 min
   2. rate limit
   3. normaliza el payload del proveedor
   ↓
ProcessInboundEmailUseCase
   4. normaliza la dirección (minúsculas, quita sub-direcciones)
   5. selecciona parser por dominio del remitente
   6. extrae código + tipo + enlace de acción
   ↓
RPC ingest_inbound_email()  — UNA transacción
   INSERT inbound_emails ON CONFLICT (message_id) DO NOTHING  ← idempotencia
   INSERT verification_pins
   INSERT notification_outbox (una fila por asignado y canal activo)
   ↓
Supabase Realtime (evalúa RLS por suscriptor)
   ↓
<LivePinCard/> — el código aparece sin recargar
```

### Códigos de respuesta del webhook (importan)

| Situación | Respuesta | Por qué |
| --- | --- | --- |
| Firma inválida | 401 | Descartar |
| Duplicado | 200 `duplicate` | Que el proveedor deje de reintentar |
| Buzón sin cuenta | 200 `ignored` | Un 4xx haría reintentar para siempre |
| Sin código | 200 `unparsed` | Se guarda para diagnóstico |
| Postgres caído | **500** | Que el proveedor **sí** reintente |

Devolver el código equivocado aquí o pierde PIN o genera reintentos infinitos.

---

## 8. Qué queda pendiente

### 8.1 Desplegar (lo inmediato)

El runbook completo está en [`docs/06-despliegue.md`](docs/06-despliegue.md):
Supabase → secretos → Vercel → dominio → correo → primer admin → verificación.

Verificaciones que **no** hay que saltarse:
- Las 9 tablas con `rowsecurity = true`.
- `pg_publication_tables` lista `verification_pins` y `profile_assignments`.
- El secreto HMAC **idéntico** en Vercel y en Cloudflare.

### 8.2 Worker de notificaciones (no implementado)

`notification_outbox` se rellena en cada ingesta pero **nadie la consume**. El
puerto `NotificationSender` existe con una implementación `noop`.

Recomendación: **empezar por Telegram** — sin plantillas que aprobar ni coste por
mensaje, valida el patrón outbox completo. WhatsApp exige plantillas aprobadas por
Meta porque el PIN llega fuera de la ventana de 24 h.

Consumo sugerido: `SELECT ... FOR UPDATE SKIP LOCKED` sobre las filas `pending`
con `next_attempt_at <= now()`.

### 8.3 Cron de caducidad (no programado)

`expire_due_assignments()` existe pero nadie la llama. **Importa para la
seguridad, no sólo para el reporte:** una asignación vencida pero aún `active`
seguiría dando acceso a los códigos vía RLS. El SQL para programarla está al final
del runbook.

### 8.4 Parsers de Disney+ y Prime Video

El catálogo los contempla y quedan **inactivos** a propósito: sin correos reales
con los que escribir tests, activarlos sólo produciría PIN mal extraídos. Añadir
uno = implementar `EmailParser` + registrarlo en `registry.ts` + tests. Cero
cambios en el webhook, el caso de uso o la UI.

---

## 9. Deuda técnica reconocida

Está documentada a propósito en lugar de disimulada. **No presentarla como
resuelta.**

### 9.1 Cifrado de credenciales (ADR-0007)

Las contraseñas de Netflix **no pueden hashearse**: el cliente necesita el valor
original. Se cifran con AES-256-GCM, pero **la clave vive en la misma variable de
entorno que la aplicación**.

Eso protege frente a un volcado de la base de datos, **no** frente al compromiso
del entorno. Ruta a producción: Supabase Vault / `pgsodium`, o un KMS externo.

`CREDENTIALS_ENCRYPTION_KEY` **no se puede rotar sin más**: al cambiarla, las
contraseñas guardadas quedan ilegibles. No hay migración automática.

### 9.2 Rate limiting en memoria

`src/lib/rate-limit.ts` es por instancia. En Vercel las funciones son efímeras, así
que **no es un límite global**. La protección real sería Upstash Redis o el
firewall de Vercel. La exposición está acotada porque la firma HMAC ya rechaza lo
no firmado antes de tocar la base de datos.

---

## 10. Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm test           # Vitest (32 tests)
npm run db:push    # aplicar migraciones (requiere CLI enlazada)
npm run db:types   # regenerar database.types.ts desde el esquema real

node scripts/generate-secrets.mjs   # los dos secretos criptográficos
node scripts/build-setup-sql.mjs    # regenera supabase/setup.sql
```

Probar el pipeline sin proveedor de correo:

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
node scripts/sign-payload.mjs tests/fixtures/netflix-household.json
```

Imprime un `curl` firmado. El fixture ya apunta a `netflix1@streamclick.xyz`.

---

## 11. Cómo trabajar en este proyecto

- **Rama:** `claude/streamclick-saas-architecture-ad9wlm`. Nunca empujar a la
  principal sin permiso explícito.
- **Idioma:** el usuario escribe en español (Costa Rica). Todo el código,
  comentarios, documentación y mensajes de commit están en español. Mantenerlo.
- **Antes de dar algo por terminado:** `npm test`, `npm run typecheck`,
  `npm run lint` y `npm run build`. El build debe pasar **sin** `.env.local`.
- **Secretos:** nunca pedirle al usuario que pegue en el chat la
  `service_role key`, los secretos generados ni tokens de acceso. Van directos del
  generador al panel correspondiente.
- **Al añadir una migración:** ejecutar `node scripts/build-setup-sql.mjs` para
  mantener `setup.sql` sincronizado.

## 12. Documentación de referencia

| Documento | Cuándo consultarlo |
| --- | --- |
| [`docs/01-arquitectura.md`](docs/01-arquitectura.md) | Estructura, capas, principios |
| [`docs/02-esquema-base-de-datos.md`](docs/02-esquema-base-de-datos.md) | Tablas, RLS, índices, vistas |
| [`docs/03-flujo-autenticacion.md`](docs/03-flujo-autenticacion.md) | Registro, login, middleware |
| [`docs/04-flujo-email-a-pin.md`](docs/04-flujo-email-a-pin.md) | El pipeline y sus modos de fallo |
| [`docs/05-integraciones-futuras.md`](docs/05-integraciones-futuras.md) | WhatsApp, Telegram, push |
| [`docs/06-despliegue.md`](docs/06-despliegue.md) | **Runbook de despliegue — el paso actual** |
| [`docs/adr/`](docs/adr/) | Por qué se tomó cada decisión |
| [`workers/inbound-email/README.md`](workers/inbound-email/README.md) | Desplegar y depurar el Worker |
