# Traspaso de contexto — StreamClick

> **Léeme primero.** Este documento existe para que una sesión nueva (Cowork,
> Claude Code o cualquier agente) arranque en frío con todo el contexto del
> proyecto: qué es, qué está construido, qué decisiones se tomaron y por qué, qué
> trampas ya se pisaron y qué queda pendiente.
>
> Última actualización: 2026-08-01 · Commit `6f294d9`+

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
| Tests | ✅ 38 en verde (5 archivos) |
| Typecheck | ✅ `tsc --noEmit` sin errores |
| Lint | ✅ Sin avisos |
| Build de producción | ✅ Correcto sin variables de entorno |
| **Proyecto de Supabase** | ✅ **Creado y con el esquema instalado** |
| **Desplegado en Vercel** | ✅ **En producción** |
| **Dominio `streamclick.xyz`** | ✅ **Resuelto y apuntando a Vercel** |
| **DNS en Cloudflare** | ✅ **Autoritativo** (`dell`/`sage.ns.cloudflare.com`) |
| **Email Routing (MX)** | ✅ **Activo** (`route1/2/3.mx.cloudflare.net`) |
| **Catch-all → Worker** | ✅ **Configurado** |
| **Email Worker desplegado** | ✅ **Desplegado** |
| **Primer admin** | ✅ **Creado** |
| **Cuenta de Netflix migrada** | ✅ **Su correo ya apunta al buzón del dominio** |
| **Código real recibido de punta a punta** | ⏳ **Pendiente de confirmar** |

Dominio y MX verificados por consulta DNS real. El resto está confirmado por
captura del panel en producción: llegan correos de Netflix al buzón del dominio y
se registran en *Correos recibidos*.

**El operador trabaja desde el móvil.** No des por hecho que puede ejecutar
comandos: para el Worker existe un workflow de GitHub Actions lanzable desde el
navegador (`docs/09-desplegar-sin-terminal.md`), y la aplicación la despliega
Vercel sola en cada push.

### Coordenadas de producción

| Qué | Valor |
| --- | --- |
| Proyecto Supabase | `stlvvdvrlgxvgrwunmwv` · región `us-east-2` · org *Streamclick* |
| URL de Supabase | `https://stlvvdvrlgxvgrwunmwv.supabase.co` |
| Proyecto Vercel | `frodev-crs-projects/streamclik` (rama `claude/streamclick-saas-architecture-ad9wlm`) |
| URL en producción | `https://streamclik.vercel.app` — `/api/health` responde `ok` |

**Las claves de Supabase son del formato nuevo** (`sb_publishable_…` y
`sb_secret_…`), no los JWT `anon`/`service_role` heredados. Funcionan igual: el
gateway resuelve el rol a partir de la clave. Ojo con el runbook, que todavía
describe el formato viejo.

### Lo que ya está configurado

- **Esquema:** 10 migraciones (las 8 iniciales + Clerk + catálogo público). Verificado: 9 tablas, **las 9 con
  `rowsecurity = true`**, 16 políticas, 7 enums y el catálogo sembrado con 3
  servicios.
- **Realtime:** publica exactamente `verification_pins` y `profile_assignments`.
- **Auth:** Site URL `https://streamclick.xyz`; redirects para el apex y `www`;
  *Confirm email* activado.
- **Vercel:** las 6 variables de entorno cargadas en *Production* y *Preview*, y
  verificadas byte a byte contra los valores originales.
- **Cron:** `expire_due_assignments()` programado cada 15 minutos con `pg_cron`
  bajo el nombre `expirar-asignaciones`.

### Autenticación: Clerk (ADR-0008)

La autenticación es **Clerk**, no Supabase Auth. La autorización **no se movió**:
sigue en RLS. Ver [ADR-0008](docs/adr/0008-clerk-como-proveedor-de-identidad.md).

- Instancia de Clerk: `intent-crawdad-1.clerk.accounts.dev` (claves `pk_test_`/
  `sk_test_`, o sea entorno de desarrollo).
- Supabase ya tiene Clerk **habilitado** como Third-Party Auth con ese dominio.
- Migración `0009` aplicada y verificada: 9 tablas con RLS, 16 políticas, **cero
  referencias a `auth.uid()`**.

**Lo único que falta para que el login funcione:** activar la integración con
Supabase en el panel de Clerk, para que el JWT lleve el claim
`role: "authenticated"`. Sin ese claim Postgres atiende como `anon`, ninguna
política concede nada, y **todo devuelve vacío sin ningún error visible**. Si
alguien reporta "entro pero no veo nada", empezar por ahí.

### Lo que falta

El dominio y el DNS **ya están resueltos** (eran los dos puntos lentos). Queda la
última milla, toda ella en paneles externos. Guía detallada en
[`docs/07-correo-entrante.md`](docs/07-correo-entrante.md).

1. **Aplicar las migraciones 0010 y 0011** en el SQL Editor de Supabase. La 0010
   añade precios y `catalogo_publico()`; la 0011 crea `orders`, el bucket
   `comprobantes` y `soltar_cuenta()`. Sin ellas la portada no muestra catálogo
   y la pantalla de compra falla al guardar. Se pueden pegar tal cual desde
   `supabase/migrations/`.
2. **Configurar los datos de cobro** en el panel: Pagos → Datos de cobro. Sin un
   número de SINPE, la pantalla de compra lo dice y el cliente no puede pagar.
3. **Redesplegar el Worker** con el arreglo de la cabecera `From` (§6.14). Desde
   el móvil: Actions → «Desplegar Email Worker» → Run workflow. Requiere los tres
   secretos de `docs/09-desplegar-sin-terminal.md` configurados en GitHub.
4. **Pedir un código real** desde Netflix y comprobar que aparece solo.

Para saber en qué punto está la cadena en cualquier momento:

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
npm run diagnostico:correo
```

Comprueba DNS, MX, salud de la app, que el webhook no esté tras Clerk, que se
exija la firma y hace un envío firmado real. Dice **cuál** de los seis eslabones
falla, que es justo lo que no se puede deducir del síntoma ("no llega ningún
código" es idéntico para casi todas las causas).

### Commits

```
6f294d9  Ampliar la landing y unificar la tipografía con el logotipo
dcf2bde  Ampliar la landing y unificar la tipografía con el logotipo
831d9b7  Rediseñar la identidad: logotipo, fondo animado y borde luminoso
9ff676f  Migrar la autenticación a Clerk conservando RLS
a9a7291  Actualizar el traspaso con el estado real del despliegue
28aa647  Normalizar los finales de línea con .gitattributes
31b62a3  Añadir HANDOFF.md para arrancar sesiones nuevas en frío
a255eb1  Añadir el paquete de despliegue: correo entrante, SQL de instalación y runbook
635f6fc  Implementar StreamClick: SaaS de cuentas compartidas de streaming
```

`.gitattributes` normaliza los finales de línea: sin él, un clon en Windows
convierte el árbol entero a CRLF y `git status` marca los 113 archivos como
modificados sin un solo cambio real de contenido.

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
| `@supabase/ssr` | 0.12.4 | ⚠️ **Ya no se importa** desde la migración a Clerk. Dependencia muerta, candidata a eliminar. Si se reintroduce, no bajar de 0.12 (§6.1) |
| `@clerk/nextjs` | — | Autenticación (ADR-0008) |
| Vitest | 2.1.9 | |

---

## 4. Mapa del repositorio

```
src/
├── app/                        # Rutas. Las páginas son delgadas por diseño.
│   ├── (auth)/                 # login/[[...rest]] · registro/[[...rest]] (Clerk)
│   ├── (dashboard)/            # área privada, navegación separada por rol
│   │   ├── dashboard/          #   cliente: Mis suscripciones
│   │   ├── configuracion/      #   cliente: sus datos
│   │   ├── bienvenida/         #   cliente: captura del WhatsApp tras registrarse
│   │   └── admin/              #   operador: banco · clientes · plataformas
│   │   └── layout.tsx          # ⚠️ export const dynamic = 'force-dynamic'
│   ├── catalogo/               # página pública de catálogo
│   └── api/webhooks/inbound-email/route.ts   # ⭐ entrada del pipeline
│
├── core/                       # ⚠️ NO importar Next ni Supabase aquí
│   ├── domain/                 # entidades (objetos planos) + value objects
│   ├── ports/                  # interfaces: EmailParser, repositorios, NotificationSender
│   ├── shared/                 # Result<T,E>, DomainError
│   └── use-cases/              # ProcessInboundEmail, AssignProfile, RevokeAssignment
│
├── infrastructure/
│   ├── supabase/               # server.ts · client.ts · admin.ts · database.types.ts
│   ├── email/parsers/          # ⭐ netflix.parser.ts — el núcleo del valor
│   ├── email/providers/        # verificación HMAC + normalización por proveedor
│   ├── repositories/           # implementaciones sobre Supabase
│   ├── crypto/                 # cifrado de credenciales (AES-256-GCM)
│   └── container.ts            # composition root — única fábrica de dependencias
│
├── features/                   # UI por módulo vertical: auth · accounts · pins · admin
├── components/                 # logo · shader-background · ui/ (Button, Card, Badge…)
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

> **Histórico:** desde la migración a Clerk, `@supabase/ssr` ya no se importa en
> ninguna parte (los clientes usan `createClient` de `supabase-js` con
> `accessToken`). Se conserva esta entrada porque el síntoma —todo resuelto como
> `never`— es idéntico al de §6.2, que **sí** sigue vigente.

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
> Dos avisos de esta lista **dejaron de aplicar** al migrar a Clerk: el de
> devolver el mismo `NextResponse` en el middleware y el de `getUser()` frente a
> `getSession()`. Ambos eran del baile de cookies de Supabase Auth, que ya no
> existe. Se dejan mencionados para que nadie los "restaure" al ver código
> antiguo en un tutorial.

### 6.10 El JWT de Clerk necesita el claim `role: "authenticated"`

Sin ese claim, Postgres atiende la petición como `anon`, **ninguna política RLS
concede nada y todo devuelve vacío sin ningún error visible**. No hay excepción,
no hay log, no hay 403: simplemente cero filas en todas las pantallas.

Es el modo de fallo más desconcertante de la integración con Clerk. Si alguien
reporta *"entro pero no veo nada"*, empezar siempre por aquí y no por RLS.

Se configura activando la integración con Supabase en el panel de Clerk.

### 6.14 `message.from` del Worker NO es la cabecera `From`

En un Email Worker de Cloudflare, `message.from` es el **remitente de sobre**
(`MAIL FROM` de SMTP). Netflix entrega a través de SES, así que ahí llega algo
como `010f019fbdcf0972-cd1dd5…@amazonses.com`, no `info@account.netflix.com`.

Rompe el producto entero: `NetflixEmailParser.canHandle()` exige dominio de
Netflix para que un phishing no inyecte códigos falsos, así que con el remitente
de sobre **rechazaría todos los correos legítimos**. Y el fallo es silencioso: el
correo se guarda como «sin código», exactamente igual que un promocional.

El Worker usa `resolveFrom()`, que toma la cabecera `From` y sólo cae al
remitente de sobre si falta. El envelope sender se conserva en `envelopeFrom`
para auditoría. Cubierto por `tests/netflix-parser.test.ts`.

Se detectó mirando el monitor de correos recibidos en producción, no con tests.

### 6.12 En Tailwind v4, `bg-[--var]` NO aplica ningún color

`bg-[--color-accent]` compila sin quejarse y emite CSS **inválido**:

```css
background-color: --color-accent;   /* falta var(): el navegador lo descarta */
```

El resultado es un botón sin fondo, texto blanco sobre blanco e insignias
invisibles. Ni el build ni el lint ni los tipos lo detectan, y en una interfaz
oscura pasa desapercibido porque el fondo del contenedor ya era oscuro.

La sintaxis correcta es **`bg-[var(--color-accent)]`** (o `bg-(--color-accent)`,
la forma abreviada de v4). Todo el repositorio usa la primera. Al escribir clases
nuevas con tokens, siempre con `var()` dentro.

Se detectó al capturar el panel con Playwright: el botón "Crear cuenta" salía
blanco cuando debía ser negro. **Merece la pena mirar la interfaz de verdad, no
sólo comprobar que compila.**

### 6.13 Un embed de PostgREST es ambiguo si hay dos claves foráneas

`profile_assignments` apunta dos veces a `user_profiles` (`user_id` y
`assigned_by`). Un embed sin cualificar falla con PGRST201 y **la consulta entera
devuelve error**, no sólo esa rama:

```ts
user_profiles!profile_assignments_user_id_fkey ( email )   // ✅
user_profiles ( email )                                     // ✖ ambiguo
```

Se agravaba porque las consultas hacían `const { data } = await …` y devolvían
`[]` al fallar, convirtiendo un error explícito en una pantalla vacía. Ahora
devuelven `{ data, error }` y el panel muestra el fallo. **No volver a descartar
el error de una consulta.**

### 6.11 El webhook debe quedar FUERA del middleware de Clerk

Si `clerkMiddleware` intercepta `/api/webhooks/inbound-email`, el Worker de
Cloudflare recibe una **redirección al login** en lugar de un 200. Los correos
entran, Cloudflare los da por entregados y **ningún código llega jamás** — sin
que ningún test del pipeline lo detecte, porque el pipeline en sí sigue perfecto.

Lo cubre `tests/middleware-matcher.test.ts`, que lee el matcher del archivo
fuente y comprueba que no case con esa ruta. Si se edita el matcher de
`src/middleware.ts`, ese test es la red de seguridad.

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
- Las 11 tablas con `rowsecurity = true`.
- `pg_publication_tables` lista `verification_pins`, `profile_assignments` y
  `orders`.
- El bucket `comprobantes` existe y es **privado** (`public = false`).
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
npm test           # Vitest (37 tests)
npm run db:push    # aplicar migraciones (requiere CLI enlazada)
npm run db:types   # regenerar database.types.ts desde el esquema real

npm run diagnostico:correo          # diagnostica los 6 eslabones del correo
npm run secretos                    # genera los dos secretos criptográficos
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
| [`docs/06-despliegue.md`](docs/06-despliegue.md) | Runbook de despliegue completo |
| [`docs/07-correo-entrante.md`](docs/07-correo-entrante.md) | **Correo entrante — el paso actual** |
| [`docs/08-migrar-cuenta-netflix.md`](docs/08-migrar-cuenta-netflix.md) | Pasar una cuenta de Netflix a un buzón del dominio |
| [`docs/09-desplegar-sin-terminal.md`](docs/09-desplegar-sin-terminal.md) | Desplegar el Worker desde el móvil, sin terminal |
| [`docs/10-flujo-de-compra.md`](docs/10-flujo-de-compra.md) | **Cobro por SINPE, comprobantes y «Soltar cuenta»** |

### Precios y catálogo público

Los precios viven en `streaming_services.price_amount` para poder cambiarlos con
un `UPDATE` en vez de con un despliegue:

```sql
update public.streaming_services set price_amount = 4000 where slug = 'netflix';
```

La portada los lee con `catalogo_publico()`, una función SECURITY DEFINER
concedida a `anon` que devuelve **sólo agregados** —nombre, precio y recuento de
perfiles libres—. Nunca expone correos, credenciales ni quién tiene contratado
qué: es la diferencia entre publicar el escaparate y publicar el almacén.

La sección se revalida cada 5 minutos (`export const revalidate = 300` en
`src/app/page.tsx`).

### Flujo de compra

El cliente paga por SINPE, sube la captura y espera; el operador la mira y
pulsa un botón. Detalle en [`docs/10-flujo-de-compra.md`](docs/10-flujo-de-compra.md)
y el porqué en [ADR-0009](docs/adr/0009-cobro-por-comprobante-manual.md).

Lo que no hay que deshacer:

- **El precio se copia del servicio en el servidor**, nunca del formulario. Si
  llegara del cliente, cualquiera compraría por un colón editando el HTML.
- **`soltar_cuenta()` es una función de base de datos**, no tres llamadas desde
  la aplicación. El `FOR UPDATE ... SKIP LOCKED` dentro de la transacción es lo
  único que impide que un doble clic entregue el mismo perfil dos veces.
- **El bucket `comprobantes` es privado.** El panel abre las capturas con URL
  firmada de 10 minutos. Un comprobante lleva nombre, teléfono e importe.
- **`src/features/orders/presentation.ts` no importa `server-only`**: lo usan
  componentes de cliente. Meter ahí una consulta rompe el build entero.
| [`docs/adr/`](docs/adr/) | Por qué se tomó cada decisión |
| [`workers/inbound-email/README.md`](workers/inbound-email/README.md) | Desplegar y depurar el Worker |
