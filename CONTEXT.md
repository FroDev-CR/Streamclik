# Contexto de StreamClick

> **Léeme primero.** Este es el **único** documento de contexto del proyecto.
> Existe para que una sesión nueva —Cowork, Claude Code o cualquier agente—
> arranque en frío sabiendo qué es StreamClick, qué está construido, qué
> decisiones se tomaron y por qué, qué trampas ya se pisaron y qué queda
> pendiente.
>
> Última actualización: **2026-08-21** · commit `76f0c80` · rama `main`
> Sustituye al antiguo `HANDOFF.md`, que quedó congelado el 2026-08-01 y se
> retiró del repositorio para que no hubiera dos verdades compitiendo.

---

## 1. Qué es StreamClick

SaaS para revendedores de cuentas compartidas de streaming (Netflix como primer
servicio; Disney+, Max y Prime Video en el catálogo).

**El problema real que resuelve:** Netflix envía códigos de verificación
temporales al correo *dueño* de la cuenta, que controla el operador y no el
cliente final. Sin automatización, el operador reenvía cada código a mano por
WhatsApp mientras el código expira en 15 minutos.

**Lo que hace la plataforma:** recibe el correo → extrae el PIN con expresiones
regulares → lo entrega en tiempo real al cliente que tiene ese perfil asignado, y
sólo a él. Alrededor de ese núcleo hay una tienda completa: catálogo público,
carrito, cobro por SINPE con comprobante, entrega con un botón, renovaciones,
referidos y soporte.

- **Dominio de producción:** `streamclick.xyz`
- **Repositorio:** `FroDev-CR/Streamclik`
- **Rama de trabajo:** `main`

---

## 2. Estado actual

Verificado el 2026-08-21 ejecutando las comprobaciones, no por memoria.

| Aspecto | Estado |
| --- | --- |
| Tests | ✅ **86 en verde** (12 archivos) |
| Typecheck | ✅ `tsc --noEmit` sin errores |
| Migraciones | 26 en `supabase/migrations/` |
| Esquema | 20 tablas · 8 enums · RLS en todas |
| Supabase | ✅ Creado, esquema instalado |
| Vercel | ✅ En producción |
| Dominio + DNS (Cloudflare) | ✅ Resuelto y autoritativo |
| Email Routing (MX) + catch-all → Worker | ✅ Activo |
| Email Worker | ✅ Desplegado |
| Autenticación (Clerk) | ✅ Funcionando |
| Cobro por SINPE + entrega | ✅ En producción |
| PWA instalable + push al operador | ✅ Funcionando |
| Worker de `notification_outbox` | ❌ No implementado (ver §10.1) |
| Parsers de Max y Prime Video | ❌ Inactivos a propósito (ver §10.2) |

### Coordenadas de producción

| Qué | Valor |
| --- | --- |
| Proyecto Supabase | `stlvvdvrlgxvgrwunmwv` · región `us-east-2` · org *Streamclick* |
| URL de Supabase | `https://stlvvdvrlgxvgrwunmwv.supabase.co` |
| Proyecto Vercel | `frodev-crs-projects/streamclik` |
| Salud | `/api/health` responde `ok` |
| Clerk | `intent-crawdad-1.clerk.accounts.dev` (claves `pk_test_`/`sk_test_`) |

**Las claves de Supabase son del formato nuevo** (`sb_publishable_…` y
`sb_secret_…`), no los JWT `anon`/`service_role` heredados. Funcionan igual: el
gateway resuelve el rol a partir de la clave. Ojo con `docs/06-despliegue.md`,
que todavía describe el formato viejo.

**El operador trabaja desde el móvil.** No des por hecho que puede ejecutar
comandos: para el Worker existe un workflow de GitHub Actions lanzable desde el
navegador (`docs/09-desplegar-sin-terminal.md`), y la aplicación la despliega
Vercel sola en cada push.

---

## 3. Stack

| Pieza | Versión | Nota |
| --- | --- | --- |
| Node | 22.x | mínimo 20.11 |
| Next.js | 15.x | App Router · Server Components · Server Actions |
| React | 19.x | |
| TypeScript | 5.7 | `strict` + `noUncheckedIndexedAccess` |
| Tailwind CSS | v4 | sin `tailwind.config.js`: el tema va en `globals.css` |
| Supabase | `supabase-js` 2.x | Postgres + RLS + Realtime + Storage |
| Clerk | `@clerk/nextjs` 7.x | identidad (ADR-0008) |
| Resend | vía HTTP | correo saliente de credenciales |
| Vitest | 2.1.x | |

Sin dependencias para push ni analytics: **Web Push se implementa a mano** con
`node:crypto` (`src/lib/web-push.ts`) y Vercel Analytics se carga con una
etiqueta `<script>` en `layout.tsx`, no con el paquete npm.

⚠️ `@supabase/ssr` sigue en `package.json` pero **ya no se importa** desde la
migración a Clerk. Es dependencia muerta, candidata a eliminar. Si se
reintrodujera, no bajar de 0.12 (§7.1).

---

## 4. Mapa del repositorio

```
src/
├── app/                        # Rutas. Las páginas son delgadas por diseño.
│   ├── (auth)/                 # login/[[...rest]] · registro/[[...rest]] (Clerk)
│   ├── (dashboard)/            # área privada · layout.tsx: force-dynamic (§7.3)
│   │   ├── dashboard/          #   cliente: mis suscripciones
│   │   ├── cuenta/[id]/        #   cliente: credenciales, PIN en vivo, historial
│   │   ├── comprar/[slug]/     #   compra de un servicio · comprar/combo/[slug]
│   │   ├── carrito/            #   varios productos, un comprobante
│   │   ├── renovar/[id]/       #   renovación conservando el mismo perfil
│   │   ├── historial/          #   pedidos del cliente
│   │   ├── configuracion/      #   datos del cliente · perfil/ · soporte/
│   │   ├── bienvenida/         #   captura del WhatsApp tras registrarse
│   │   └── admin/              #   operador: banco · clientes · pagos ·
│   │                           #   plataformas · buzón · solicitudes ·
│   │                           #   multimedia · visitas · nueva
│   ├── catalogo/               # catálogo público
│   ├── manifest.ts             # PWA
│   └── api/
│       ├── health/             # sonda
│       ├── visita/             # contador de visitas (fuera de Clerk)
│       └── webhooks/inbound-email/route.ts   # ⭐ entrada del pipeline
│
├── core/                       # ⚠️ NO importar Next ni Supabase aquí
│   ├── domain/                 # entidades (objetos planos) + value objects
│   ├── ports/                  # EmailParser · repositorios · NotificationSender · Logger
│   ├── shared/                 # Result<T,E>, DomainError
│   └── use-cases/              # ProcessInboundEmail · AssignProfile · RevokeAssignment
│
├── infrastructure/
│   ├── supabase/               # server.ts · client.ts · admin.ts · database.types.ts
│   ├── email/parsers/          # ⭐ netflix.parser.ts · disney-plus.parser.ts · registry.ts
│   ├── email/providers/        # verificación HMAC + normalización por proveedor
│   ├── notifications/          # admin-push.ts · noop-sender.ts
│   ├── repositories/           # implementaciones sobre Supabase
│   ├── crypto/                 # cifrado de credenciales (AES-256-GCM)
│   └── container.ts            # composition root — única fábrica de dependencias
│
├── features/                   # UI por módulo vertical
│   ├── accounts/ admin/ analytics/ auth/ cart/ catalog/ media/
│   └── notifications/ orders/ pins/ reports/ rewards/ settings/ shared/
├── components/                 # logo · fondo · ui/ (Button, Card, Badge…)
└── lib/                        # env (zod) · logger · rate-limit · web-push · contacto · utils

supabase/migrations/            # 26 migraciones — fuente de verdad del esquema
supabase/setup.sql              # concatenación generada (no editar a mano)
workers/inbound-email/          # Email Worker de Cloudflare (proyecto npm aparte)
public/sw.js                    # service worker: PWA + push
docs/                           # 12 documentos · docs/adr/ 9 decisiones registradas
tests/                          # Vitest — 12 archivos, 86 tests
promo-imagenes/                 # artes de precios, combos y estados
```

**Regla de revisión mecánica:** `grep -r "@supabase\|next/" src/core/` debe salir
vacío. Si algo aparece ahí, la arquitectura está contaminada.

### El esquema, de un vistazo

20 tablas. Las del núcleo: `user_profiles`, `streaming_services`,
`streaming_accounts`, `account_profiles`, `profile_assignments`,
`inbound_emails`, `verification_pins`, `notification_outbox`, `audit_logs`.
Las de la tienda: `orders`, `order_items`, `order_assignments`,
`payment_settings`, `streaming_combos`, `streaming_combo_items`,
`profile_rewards`. Las de soporte y operación: `pin_change_requests`,
`account_reports`, `push_subscriptions`, `page_views`.

Detalle en [`docs/02-esquema-base-de-datos.md`](docs/02-esquema-base-de-datos.md).

---

## 5. Decisiones que NO hay que deshacer

Documentadas a fondo en `docs/adr/`. El resumen de por qué existen:

### 5.1 La autorización vive en RLS, no en el código (ADR-0003)

**Es la decisión central del proyecto.** Row Level Security está activo en todas
las tablas. Un `WHERE user_id = $1` en un repositorio protegería sólo ese camino
de código; RLS protege además las suscripciones de Realtime y cualquier llamada
directa a la API PostgREST con un JWT robado (la URL y la clave publicable son
públicas por diseño).

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

Los únicos endpoints HTTP públicos son el webhook de correo, `/api/visita` y
`/api/health`. Todo lo demás son Server Actions. Cada Server Action empieza con
`requireUser()` o `requireAdmin()` porque **una Server Action es un endpoint POST
público**.

### 5.5 Tres clientes de Supabase, nunca mezclados (ADR-0004)

| Fichero | Clave | RLS |
| --- | --- | --- |
| `supabase/server.ts` | publicable + JWT de Clerk | ✅ aplica |
| `supabase/client.ts` | publicable | ✅ aplica |
| `supabase/admin.ts` | `service_role` | ❌ **la omite** |

`admin.ts` se usa **sólo** en operaciones del sistema —el webhook de ingesta, el
aviso push al operador, el borrado de clientes— y nunca para conveniencia.
Importa `server-only` para que el build falle si algo lo arrastra a un bundle de
cliente.

### 5.6 Clerk emite la identidad; RLS sigue autorizando (ADR-0008)

La autenticación es Clerk, no Supabase Auth. La autorización **no se movió**.
Supabase valida el JWT de Clerk contra su JWKS (Third-Party Auth). Cero
referencias a `auth.uid()` en el esquema: se usa `current_user_id()`.

### 5.7 Cobro por comprobante manual, no pasarela (ADR-0009)

SINPE Móvil es lo que la gente usa en Costa Rica: sin comisión, sin alta de
comercio, sin pedirle la tarjeta al cliente. Lo que no tiene es confirmación
automática, así que alguien mira el comprobante. Tres invariantes:

1. El pedido es una fila en `orders` con su propio ciclo de estados, no un campo
   en la asignación. Existe antes que la asignación y sigue existiendo si se
   rechaza: es el registro de qué se cobró.
2. El precio se **congela** en el pedido al crearlo, copiado del servicio **en el
   servidor**. Un cambio de tarifa no reescribe lo ya vendido y el importe nunca
   llega desde el formulario.
3. Los comprobantes van a un bucket **privado**; el panel los abre con URL
   firmada de diez minutos.

### 5.8 WhatsApp como canal de aviso está evaluado y **descartado**

No es un hueco pendiente. Baileys no puede vivir en Vercel (WebSocket permanente
+ sesión en disco), no es oficial —WhatsApp puede cerrar el número del negocio— y
la notificación push ya llega igual de rápido al mismo teléfono sin mantener nada
encendido. Razonamiento completo en
[`docs/11-avisos-de-pago.md`](docs/11-avisos-de-pago.md) §5.

Si algún día hiciera falta WhatsApp **hacia los clientes** (no hacia el
operador), lo que corresponde evaluar es la Cloud API oficial de Meta. Es otro
problema.

---

## 6. Los flujos de negocio

### 6.1 Compra

Catálogo público (`catalogo_publico()` y `combos_publicos()`, funciones
`security definer` porque `anon` no puede leer `streaming_accounts`) → el cliente
elige servicio o combo → `comprar/[slug]` o el carrito → paga por SINPE con los
datos de `payment_settings` → sube el comprobante al bucket privado → el pedido
pasa a `esperando_revision` y **le llega un push al operador** → el operador
revisa en `/admin/pagos` y pulsa entregar → `soltar_cuenta()` busca perfiles
libres, los reserva **todos antes de crear ninguna asignación** (para que no haya
entregas parciales en un combo) y crea las filas → Resend manda las credenciales.

Estados de `orders`: `esperando_comprobante` → `esperando_revision` →
`entregado` | `rechazado` | `cancelado`.

### 6.2 Renovación

Antes renovar era comprar de nuevo, y el sistema entregaba **un perfil libre
cualquiera**: le cambiaba el perfil, el PIN y a veces hasta la cuenta. Ahora
`crear_renovacion()` / `aprobar_renovacion()` **extienden la asignación que ya
tiene**. Cubierto por `tests/renovacion.test.ts`.

### 6.3 Referidos y rebajo

Cada cliente tiene un código (`generate_referral_code()`). La recompensa **no
nace** al escribir el código ni al subir el comprobante: se crea dentro de
`soltar_cuenta()`, en la misma transacción que aprueba el pago. Así un
comprobante rechazado nunca genera un premio.

Desde la migración 0024 la recompensa es un **rebajo de ₡1000** en la siguiente
compra, no un perfil gratis: más barato, más fácil de explicar y no consume
inventario vendible. Se aplica automáticamente (`consumir_rebajos()`,
`devolver_rebajos()` si el pedido se cae).

### 6.4 Solicitudes de cambio de PIN

El cliente no puede cambiar el PIN de su perfil por su cuenta: hacerlo exige
entrar a Netflix con las credenciales de la cuenta, y entregárselas anularía el
aislamiento entre los clientes que la comparten. Se modela como petición: el
cliente dice qué PIN quiere (`pin_change_requests`), el operador lo aplica y
marca la solicitud (`aplicar_cambio_pin()`), en `/admin/solicitudes`.

### 6.5 Reportes de cuenta

Cuando algo falla, el cliente abre un reporte con captura desde `/soporte` en vez
de escribir por WhatsApp. `account_reports` + `/admin` para verlos y cerrarlos.

### 6.6 Avisos al operador (Web Push)

El cliente sube el comprobante → `avisarDePagoPendiente()` →
`notificarAdminsDePago()` → `sendPush()` por cada dispositivo suscrito → el
service worker muestra la notificación → al tocarla se abre `/admin/pagos`.
Se dispara en los **tres** caminos: compra directa, carrito y reenvío de
comprobante corregido. Puesta en marcha y trampas en
[`docs/11-avisos-de-pago.md`](docs/11-avisos-de-pago.md).

### 6.7 Operación

Biblioteca multimedia en `/admin/multimedia` (respaldo propio de las piezas de
publicidad; el listado sale del bucket, sin tabla de metadatos, para que no
exista la divergencia clásica entre fila y archivo). Contador de visitas propio
en `/admin/visitas`, que responde a lo que ninguna herramienta externa contesta
bien: «entraron cuarenta personas y compraron tres».

---

## 7. Trampas ya pisadas (no reintroducir)

**La sección más valiosa del documento.** Cada punto costó un ciclo de
depuración.

### 7.1 `@supabase/ssr` < 0.12 rompe TODOS los tipos

> Histórico: desde Clerk, `@supabase/ssr` ya no se importa. Se conserva porque el
> síntoma —todo resuelto como `never`— es idéntico al de §7.2, que **sí** sigue
> vigente.

Con `@supabase/ssr` 0.5.2 y `supabase-js` 2.111, `createServerClient<Database>()`
devuelve un cliente cuyo schema se resuelve como `never`. Decenas de
`Property 'email' does not exist on type 'never'` en los ficheros que
*consultan*, no donde está la causa. **Solución: ≥ 0.12.4.**

### 7.2 El tipo `Database` escrito a mano tiene una forma obligatoria

`src/infrastructure/supabase/database.types.ts` está escrito a mano para que el
repo compile sin una instancia de Supabase. `postgrest-js` sólo lo reconoce si:

- cada **tabla** declara `Row`, `Insert`, `Update` **y `Relationships`**
- cada **vista** declara al menos `Row` y `Relationships`
- `Update` nunca es `never` (usar `Record<string, never>` para tablas inmutables)

Si falta cualquiera, el esquema deja de encajar en `GenericSchema` y **todo**
vuelve a resolverse como `never`. Con una base real, `npm run db:types` lo
regenera bien y el problema desaparece.

### 7.3 Las rutas con sesión deben ser `force-dynamic` explícito

`src/app/(dashboard)/layout.tsx` declara `export const dynamic = 'force-dynamic'`.

Sin esa línea el build **funciona si existe `.env.local` y falla si no**: durante
el prerenderizado se evalúa `getServerEnv()` (que lanza) antes de llegar al
acceso a `cookies()` que provocaría el salto a dinámico. El error es un
`prerender-error` de `/admin` que no señala la causa real.

Además es semánticamente correcto: una página de dashboard prerenderizada sería
el dashboard de *alguien*, servido a todo el mundo.

### 7.4 Los patrones del parser necesitan un hueco entre el ancla y el código

El correo real dice **"Tu código *de acceso temporal es* 4821"** — 22 caracteres
entre el literal y el número. Los primeros patrones exigían el código casi pegado
a "código" y fallaban con el correo más habitual del sistema.

La solución es `GAP = [^\d]{0,40}` en `netflix.parser.ts`. No puede tragarse el
propio código porque `[^\d]` no casa con dígitos, así que la expansión codiciosa
se detiene sola en el primer número.

### 7.5 Hay que probar los DOS cuerpos del correo, no elegir uno

Un heurístico de "usa `text` si mide más de 40 caracteres" descartaba el HTML en
correos donde la parte de texto era un stub. Ahora se prueban `text` y luego el
HTML convertido, en orden. Netflix a menudo envía **sólo** HTML.

### 7.6 Los años del pie de página parecen códigos

`PinCode.isPlausibleCode()` descarta números de 4 dígitos entre 1990 y 2100 y
secuencias de dígitos iguales (`0000`). Sin ese filtro, el patrón genérico extrae
"2026" del copyright con total confianza y el cliente recibe un código que no
funciona — **peor que no recibir nada**, porque parece correcto.

### 7.7 La firma del Worker y la de la app deben coincidir byte a byte

El Email Worker firma con **Web Crypto**; la aplicación verifica con
**node:crypto**. Si divergen, el webhook responde 401 y **ningún código llega
jamás**, sin que ningún test de la app lo detecte.

`tests/worker-signature-compat.test.ts` reproduce la firma del Worker
exactamente, incluyendo tildes y la eñe (una diferencia de codificación sólo
fallaría con los correos reales en español). **Si se toca `hmacSha256Hex()` en el
Worker, hay que tocar también ese test.**

### 7.8 `message.from` del Worker NO es la cabecera `From`

En un Email Worker de Cloudflare, `message.from` es el **remitente de sobre**
(`MAIL FROM`). Netflix entrega vía SES, así que ahí llega
`010f019fbdcf0972-…@amazonses.com`, no `info@account.netflix.com`.

Rompe el producto entero: `canHandle()` exige dominio de Netflix para que un
phishing no inyecte códigos falsos, así que con el remitente de sobre
**rechazaría todos los correos legítimos**. Y el fallo es silencioso: el correo
se guarda como «sin código», igual que un promocional.

El Worker usa `resolveFrom()`, que toma la cabecera `From` y sólo cae al
remitente de sobre si falta. El envelope sender se conserva en `envelopeFrom`
para auditoría.

**Se detectó mirando el monitor de correos en producción, no con tests.**

### 7.9 El webhook debe quedar FUERA del middleware de Clerk

Si `clerkMiddleware` intercepta `/api/webhooks/inbound-email`, el Worker recibe
una **redirección al login** en lugar de un 200. Los correos entran, Cloudflare
los da por entregados y **ningún código llega jamás** — sin que ningún test del
pipeline lo detecte, porque el pipeline en sí sigue perfecto.

Lo cubre `tests/middleware-matcher.test.ts`, que lee el matcher del archivo
fuente. Si se edita `src/middleware.ts`, ese test es la red de seguridad.

Por el mismo motivo quedan fuera `sw.js`, `manifest.webmanifest` y
`/api/visita`: el navegador los pide **sin cookies**, y una redirección los
rompería en silencio (la aplicación dejaría de ser instalable y de actualizarse).

### 7.10 El JWT de Clerk necesita el claim `role: "authenticated"`

Sin ese claim, Postgres atiende como `anon`, **ninguna política RLS concede nada
y todo devuelve vacío sin ningún error visible**. No hay excepción, no hay log,
no hay 403: cero filas en todas las pantallas.

Es el modo de fallo más desconcertante de la integración. Si alguien reporta
*"entro pero no veo nada"*, empezar siempre por aquí y no por RLS. Se configura
activando la integración con Supabase en el panel de Clerk.

### 7.11 En Tailwind v4, `bg-[--var]` NO aplica ningún color

`bg-[--color-accent]` compila sin quejarse y emite CSS **inválido**:

```css
background-color: --color-accent;   /* falta var(): el navegador lo descarta */
```

El resultado es un botón sin fondo, texto blanco sobre blanco e insignias
invisibles. Ni el build ni el lint ni los tipos lo detectan, y en una interfaz
oscura pasa desapercibido.

La sintaxis correcta es **`bg-[var(--color-accent)]`** (o `bg-(--color-accent)`).
Todo el repositorio usa la primera.

Se detectó capturando el panel con Playwright. **Merece la pena mirar la interfaz
de verdad, no sólo comprobar que compila.**

### 7.12 Un embed de PostgREST es ambiguo si hay dos claves foráneas

`profile_assignments` apunta dos veces a `user_profiles` (`user_id` y
`assigned_by`). Un embed sin cualificar falla con PGRST201 y **la consulta entera
devuelve error**, no sólo esa rama:

```ts
user_profiles!profile_assignments_user_id_fkey ( email )   // ✅
user_profiles ( email )                                     // ✖ ambiguo
```

Se agravaba porque las consultas hacían `const { data } = await …` y devolvían
`[]` al fallar, convirtiendo un error explícito en una pantalla vacía. Ahora
devuelven `{ data, error }`. **No volver a descartar el error de una consulta.**

### 7.13 `create table if not exists` no arregla una tabla que ya existía

Síntoma: *«No se pudieron cargar las solicitudes ·
column pin_change_requests.note does not exist»*.

La migración 0018 creaba la tabla con `if not exists`. En una base donde la tabla
ya existía —creada a mano o desde un borrador previo— la migración no hacía nada
y las columnas nuevas nunca aparecían. La 0021 la repara con `alter table … add
column if not exists`. **Al escribir una migración, asumir que la tabla puede
existir con otra forma.**

### 7.14 Una FK en `restrict` bloquea borrados que parecen no tener nada que ver

Borrar un cliente fallaba siempre con `23503 … order_assignments_assignment_id_fkey`.
La cadena de borrado se cortaba en una tabla intermedia que nadie tenía en mente.
La 0025 pone las cascadas correctas. Al añadir una tabla que referencie
asignaciones o pedidos, **decidir explícitamente qué pasa al borrar**.

### 7.15 `server-only` rompe Vitest

`vitest.config.ts` aliasa `server-only` al `empty.js` del propio paquete. Sin
eso, cualquier test que importe código de servidor falla con *"This module cannot
be imported from a Client Component module"*.

### 7.16 Detalles de Next 15 ya resueltos

- `cookies()`, `params` y `searchParams` son **promesas** — hay que hacer `await`.
- `redirect()` lanza `NEXT_REDIRECT` por diseño: **llamarlo siempre fuera del
  `try`**, o el `catch` se lo traga y el formulario no navega.

> Dos avisos antiguos **dejaron de aplicar** al migrar a Clerk: el de devolver el
> mismo `NextResponse` en el middleware y el de `getUser()` frente a
> `getSession()`. Eran del baile de cookies de Supabase Auth, que ya no existe.
> Se mencionan para que nadie los "restaure" al ver código antiguo en un tutorial.

### 7.17 La firma del JWT de VAPID va en `ieee-p1363`

Con el DER que Node devuelve por defecto, el servicio de push responde **401 sin
explicar por qué**. `tests/web-push.test.ts` comprueba el cifrado contra los
vectores del apéndice A del RFC 8291, byte a byte: si una derivación estuviera
mal, el código produciría un buffer de aspecto razonable y sería el navegador
quien lo descartaría, en silencio.

### 7.18 El service worker no cachea navegaciones

**Nunca** se guardan respuestas de navegación: servirían el panel de un usuario al
siguiente que abriera la aplicación en el mismo teléfono, saltándose Clerk y RLS.
Y `showNotification` se llama **siempre** que llega un push, aunque la carga venga
malformada: los navegadores revocan el permiso a quien no muestra nada.

---

## 8. El pipeline correo → PIN

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

### Diagnóstico

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
npm run diagnostico:correo
```

Comprueba DNS, MX, salud de la app, que el webhook no esté tras Clerk, que se
exija la firma, y hace un envío firmado real. Dice **cuál** de los seis eslabones
falla, que es justo lo que no se puede deducir del síntoma («no llega ningún
código» es idéntico para casi todas las causas).

---

## 9. Verificaciones que no hay que saltarse al desplegar

Runbook completo en [`docs/06-despliegue.md`](docs/06-despliegue.md).

- Todas las tablas con `rowsecurity = true`.
- `pg_publication_tables` lista `verification_pins`, `profile_assignments` y
  `orders`.
- El bucket `comprobantes` existe y es **privado** (`public = false`).
- El secreto HMAC **idéntico** en Vercel y en Cloudflare.
- `expire_due_assignments()` programada con `pg_cron` (`expirar-asignaciones`,
  cada 15 min). **Importa para la seguridad, no sólo para el reporte:** una
  asignación vencida pero aún `active` seguiría dando acceso a los códigos vía
  RLS.

---

## 10. Qué queda pendiente

### 10.1 Worker de notificaciones

`notification_outbox` se rellena en cada ingesta pero **nadie la consume**. El
puerto `NotificationSender` existe con implementación `noop`.

Recomendación: **empezar por Telegram** — sin plantillas que aprobar ni coste por
mensaje, valida el patrón outbox completo. Consumo sugerido:
`SELECT … FOR UPDATE SKIP LOCKED` sobre las filas `pending` con
`next_attempt_at <= now()`.

(WhatsApp hacia el operador está descartado, §5.8.)

### 10.2 Parsers de Max y Prime Video

Netflix y Disney+ están activos en `registry.ts`. Max y Prime Video se venden en
el catálogo pero **su parser no existe**: sin correos reales con los que escribir
tests, activarlos sólo produciría PIN mal extraídos. Añadir uno = implementar
`EmailParser` + registrarlo en `registry.ts` + tests. Cero cambios en el webhook,
el caso de uso o la UI.

> Ojo: `pin_regex_patterns` en `streaming_services` es **documentación del
> formato esperado, no la ruta de extracción**. Hoy no se lee desde ningún sitio
> del código; la extracción real la hacen los parsers tipados.

### 10.3 Mejoras pequeñas ya identificadas

- El push **no avisa de las solicitudes de cambio de PIN**, sólo de los pagos.
  Añadirlo es llamar a `notificarAdminsDePago()` desde `solicitarCambioPinAction`.
- **No hay reintentos de push.** Si el envío falla, se pierde.
- Eliminar `@supabase/ssr` de `package.json` (dependencia muerta).

---

## 11. Deuda técnica reconocida

Documentada a propósito en lugar de disimulada. **No presentarla como resuelta.**

### 11.1 Cifrado de credenciales (ADR-0007)

Las contraseñas de Netflix **no pueden hashearse**: el cliente necesita el valor
original. Se cifran con AES-256-GCM, pero **la clave vive en la misma variable de
entorno que la aplicación**. Eso protege frente a un volcado de la base de datos,
**no** frente al compromiso del entorno. Ruta a producción: Supabase Vault /
`pgsodium`, o un KMS externo.

`CREDENTIALS_ENCRYPTION_KEY` **no se puede rotar sin más**: al cambiarla, las
contraseñas guardadas quedan ilegibles. No hay migración automática.

### 11.2 Rate limiting en memoria

`src/lib/rate-limit.ts` es por instancia. En Vercel las funciones son efímeras,
así que **no es un límite global**. La protección real sería Upstash Redis o el
firewall de Vercel. La exposición está acotada porque la firma HMAC rechaza lo no
firmado antes de tocar la base de datos.

### 11.3 Claves de Clerk en modo desarrollo

La instancia es `pk_test_`/`sk_test_`. Pasar a producción exige dominio propio en
Clerk y volver a apuntar la integración con Supabase.

---

## 12. Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción (debe pasar SIN .env.local)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm test           # Vitest — 86 tests
npm run db:push    # aplicar migraciones (requiere CLI enlazada)
npm run db:types   # regenerar database.types.ts desde el esquema real

npm run diagnostico:correo          # diagnostica los 6 eslabones del correo
npm run secretos                    # genera los dos secretos criptográficos
npm run claves:push                 # genera las claves VAPID
node scripts/build-setup-sql.mjs    # regenera supabase/setup.sql
```

Probar el pipeline sin proveedor de correo:

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
node scripts/sign-payload.mjs tests/fixtures/netflix-household.json
```

Imprime un `curl` firmado. El fixture ya apunta a `netflix1@streamclick.xyz`.

---

## 13. Cómo trabajar en este proyecto

- **Rama:** `main`.
- **Nunca hacer `git push`.** Dejar los cambios hechos y el commit local; el push
  lo hace el usuario.
- **En los commits, no añadir coautores.** Sólo figura el GitHub del usuario.
- **Idioma:** español (Costa Rica). Código, comentarios, documentación y mensajes
  de commit, todo en español. Mantenerlo.
- **Antes de dar algo por terminado:** `npm test`, `npm run typecheck`,
  `npm run lint` y `npm run build`. El build debe pasar **sin** `.env.local`.
- **Secretos:** nunca pedirle al usuario que pegue en el chat la
  `service_role key`, los secretos generados ni tokens de acceso. Van directos del
  generador al panel correspondiente.
- **Este documento es el contexto.** Al cerrar un trabajo que cambie el estado,
  las decisiones o añada una trampa nueva, actualizarlo aquí — no crear otro
  documento paralelo.

### Documentación de apoyo

| Documento | Contenido |
| --- | --- |
| [01-arquitectura](docs/01-arquitectura.md) | Capas, carpetas, principios |
| [02-esquema-base-de-datos](docs/02-esquema-base-de-datos.md) | Tablas, RLS, índices, vistas |
| [03-flujo-autenticacion](docs/03-flujo-autenticacion.md) | Registro, login, middleware |
| [04-flujo-email-a-pin](docs/04-flujo-email-a-pin.md) | El pipeline y sus modos de fallo |
| [05-integraciones-futuras](docs/05-integraciones-futuras.md) | Canales pendientes |
| [06-despliegue](docs/06-despliegue.md) | Runbook completo |
| [07-correo-entrante](docs/07-correo-entrante.md) | Cloudflare, MX, Worker |
| [08-migrar-cuenta-netflix](docs/08-migrar-cuenta-netflix.md) | Apuntar una cuenta al buzón |
| [09-desplegar-sin-terminal](docs/09-desplegar-sin-terminal.md) | Desde el móvil, con Actions |
| [10-correo-de-entrega-resend](docs/10-correo-de-entrega-resend.md) | Credenciales por correo |
| [10-flujo-de-compra](docs/10-flujo-de-compra.md) | Pedido, comprobante, entrega |
| [11-avisos-de-pago](docs/11-avisos-de-pago.md) | Web Push y por qué no WhatsApp |
| [docs/adr/](docs/adr/) | Las 9 decisiones registradas con su justificación |
