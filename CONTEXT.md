# StreamClick · Contexto completo del proyecto

> Documento de traspaso. Está escrito para que una sesión nueva de Claude pueda
> ponerse a trabajar sin que nadie tenga que explicar nada. Si algo de aquí
> contradice al código, **manda el código**: este archivo se queda viejo, el
> repositorio no.
>
> Última revisión: commit `76f0c80` (contador de visitas).

---

## 1. Qué es StreamClick

Un SaaS para revender **perfiles** de cuentas de streaming compartidas
(Netflix, Disney+, Max, Prime Video) en Costa Rica.

El problema que resuelve no es vender: es el **código de verificación**.

Netflix manda el código de «hogar» al correo del titular de la cuenta, que es el
operador, no el cliente. Sin StreamClick, el flujo real es: el cliente escribe
por WhatsApp → el operador ve el correo → copia el código → lo reenvía. El código
vive quince minutos y el operador duerme.

StreamClick pone cada cuenta detrás de un buzón propio del dominio
(`netflix1@streamclick.xyz`), recibe el correo, extrae el código y lo muestra en
vivo al cliente en su panel. Nadie escribe a nadie.

**El eslogan del producto —«cuenta y código automáticos»— es el diferencial.**
Cualquiera revende cuentas; casi nadie automatiza el código.

- Producción: **https://streamclick.xyz** (Vercel)
- Repositorio: `FroDev-CR/Streamclik`, rama **`main`**
- Operador/dueño: trabaja **casi siempre desde el móvil**. Sin terminal.

---

## 2. Estado actual: qué funciona y qué no

### Funciona en producción

| Área | Estado |
| --- | --- |
| Registro/login con Clerk | ✅ |
| Landing con catálogo y combos en vivo | ✅ |
| Carrito y compra por SINPE con comprobante | ✅ |
| Panel de pagos con botón «Soltar cuenta» | ✅ |
| Códigos de verificación en vivo (Realtime) | ✅ **sólo Netflix y Disney+** |
| Correo de entrega de credenciales (Resend) | ✅ |
| Programa de referidos y recompensas | ✅ |
| Banco de cuentas, clientes, plataformas, combos | ✅ |
| Biblioteca multimedia del operador | ✅ |
| Instalable como app (PWA) en Android/iOS | ✅ |
| Solicitudes de cambio de PIN | ✅ |
| Reportes de cuenta (el cliente avisa de un problema) | ✅ |
| Renovación de suscripciones | ✅ |
| Aviso push al operador cuando entra un pago | ✅ |
| Contador de visitas + Vercel Analytics | ✅ |

### NO funciona todavía (importante)

- **Max y Prime Video no extraen códigos automáticamente.** Sólo existen
  `netflix.parser.ts` y `disney-plus.parser.ts` en el registro. Los `pin_regex_patterns`
  guardados en la tabla `streaming_services` **no los lee ningún sitio del código**:
  son documentación del formato, no una ruta de extracción. Un correo de Max llega,
  se guarda en `inbound_emails` y no produce ningún PIN. Ese código hay que
  reenviarlo a mano.
  **Para escribir un parser nuevo hace falta el texto de un correo real** de esa
  plataforma; se puede sacar del monitor de correos en `/admin/buzon`.
- **No hay renovación automática.** Cobrar el mes siguiente es un pedido nuevo.
- **No se avisa por WhatsApp automáticamente, y se descartó a propósito.** Ver
  `docs/11-avisos-de-pago.md`: el aviso al operador se resolvió con notificaciones
  push (Web Push, cifrado de punta a punta), que no cuestan nada ni dependen de la
  API de negocio de Meta. El panel sigue ofreciendo un enlace `wa.me` para escribir
  a mano. `notification_outbox` se rellena en cada ingesta pero **nadie la consume**.
- **No hay cron de caducidad.** `expire_due_assignments()` existe pero no está
  programada.
- **Los avisos push son sólo para el operador**, no para el cliente.

---

## 3. Stack y versiones reales

- **Next.js 15** (App Router) · **React 19** · **TypeScript 5.7** (estricto)
- **Supabase** (PostgreSQL + RLS + Realtime + Storage)
- **Clerk** para identidad (`@clerk/nextjs` ^7.6) con Supabase *Third-Party Auth*
- **Tailwind CSS v4** (tokens `@theme` en `globals.css`, sin `tailwind.config`)
- **Zod** para validación, **Vitest** para tests, **sonner** para toasts
- **Cloudflare Email Routing + Email Worker** para el correo entrante
- **Resend** para el correo de entrega (vía `fetch` a su API; no hay SDK instalado)
- **Web Push (VAPID)** para avisar al operador, implementado a mano en el service
  worker; no hay librería `web-push` instalada
- **Vercel Web Analytics**, cargando el script del borde en vez del paquete
- Node ≥ 20.11

`next.config.ts` **rompe el build** ante errores de tipo o de lint, a propósito.

---

## 4. Servicios externos y variables de entorno

Variables validadas con Zod en `src/lib/env.ts`. Si falta una, la aplicación
falla al arrancar con un mensaje que las lista.

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave publicable (viaja al navegador **por diseño**) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Omite RLS.** Sólo la usa el webhook de ingesta |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk (cliente) |
| `CLERK_SECRET_KEY` | Clerk (servidor) |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | Firma HMAC del webhook. ≥32 caracteres |
| `CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM, 64 caracteres hex |
| `RESEND_API_KEY` | Opcional. Sin ella, la entrega avisa de que el correo quedó pendiente |
| `RESEND_FROM_EMAIL` | Por defecto `cuentas@streamclick.xyz` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Opcionales. Notificaciones push (`node scripts/generar-claves-vapid.mjs`) |
| `VAPID_SUBJECT` | Por defecto `mailto:soporte@streamclick.xyz` |
| `NEXT_PUBLIC_SITE_URL` | Enlaces absolutos en correos |

> ⚠️ **Regla en vigor y no negociable:** los identificadores (Zone ID, Account ID,
> project ref) se pueden compartir en chat; **los tokens, claves y secretos NO**.
> Van directos de donde se generan al campo donde se usan. Ya hubo un token de
> Cloudflare pegado en un chat y hubo que revocarlo.

El número de WhatsApp del operador vive en `src/lib/contacto.ts`, en una sola
constante.

---

## 5. Mapa del repositorio

```
src/
  app/                      # App Router
    (auth)/                 # login, registro  → Clerk
    (dashboard)/            # todo lo que exige sesión
      dashboard/            # «Mis suscripciones» (cliente)
      perfil/               # Mi perfil + historial de compras + referidos
      carrito/  comprar/    # compra: carrito y checkout por slug o combo
      renovar/[assignmentId]/  # renovar una suscripción que vence
      soporte/              # reportar un problema y pedir cambio de PIN
      cuenta/[id]/          # detalle de una cuenta: PIN en vivo + credenciales
      admin/                # SÓLO operador
        page.tsx            #   Banco de cuentas
        buzon/              #   Monitor de correos entrantes
        pagos/              #   Cola de comprobantes + «Soltar cuenta»
        solicitudes/        #   Cambios de PIN y reportes de cuenta
        clientes/           #   Clientes y recompensas
        visitas/            #   Contador de visitas
        multimedia/         #   Biblioteca de artes (imágenes/vídeos)
        plataformas/        #   Plataformas, combos y datos de cobro
        nueva/              #   Alta de cuenta
    api/webhooks/inbound-email/   # ← Cloudflare Worker (HMAC, sin sesión)
    api/visita/                   # registro de visitas (fuera del middleware)
    manifest.ts  sin-conexion/    # PWA
    page.tsx  catalogo/           # público

  core/                     # SIN dependencias de framework
    domain/entities/        # VerificationPin, reglas puras, ventana en vivo
    domain/value-objects/   # EmailAddress, PinCode
    ports/                  # EmailParser, Logger, NotificationSender, repos
    use-cases/              # process-inbound-email, assign-profile, revoke
    shared/                 # Result<T,E>, DomainError

  features/                 # módulos verticales de UI (queries + actions + components)
    accounts/ admin/ analytics/ auth/ cart/ catalog/ media/ notifications/
    orders/ pins/ reports/ rewards/ settings/

  infrastructure/
    supabase/               # server.ts · client.ts · admin.ts · public-client.ts
                            # database.types.ts (escrito a MANO)
    email/parsers/          # netflix, disney-plus, registry
    email/                  # resend-delivery-email, webhook-verification
    crypto/credential-cipher.ts
    repositories/  container.ts

  components/ui/            # Button, Card, Badge, Input, Hero, ShineBorder
  lib/                      # env, logger, utils, rate-limit, contacto

supabase/migrations/        # 18 migraciones · FUENTE DE VERDAD del esquema
supabase/setup.sql          # GENERADO. `node scripts/build-setup-sql.mjs`
workers/inbound-email/      # Cloudflare Email Worker
docs/                       # 11 documentos + 9 ADR
promo-imagenes/             # artes de publicidad generados
```

### Los cuatro clientes de Supabase, nunca mezclados

| Cliente | Identidad | Se usa en |
| --- | --- | --- |
| `supabase/server.ts` | JWT de Clerk · **RLS aplica** | Server Components y Server Actions |
| `supabase/client.ts` | JWT de Clerk · **RLS aplica** | Realtime y subidas desde el navegador |
| `supabase/public-client.ts` | anónima | Catálogo de la portada |
| `supabase/admin.ts` | `service_role` · **omite RLS** | **Sólo** el webhook de ingesta |

---

## 6. Modelo de datos

16 tablas en `public`, **todas con RLS activo**.

| Tabla | Para qué |
| --- | --- |
| `user_profiles` | Perfil interno. `id` uuid + `clerk_user_id` text + `referral_code` |
| `streaming_services` | Catálogo: precio, color, `icon_key`, dominios remitentes |
| `streaming_combos` / `streaming_combo_items` | Paquetes y qué servicios (y cuántos perfiles) trae cada uno |
| `streaming_accounts` | Cuentas reales. Credenciales **cifradas**. `inbox_email` único |
| `account_profiles` | Los perfiles vendibles de cada cuenta |
| `profile_assignments` | Qué perfil tiene qué cliente y hasta cuándo |
| `orders` | Pedidos. Precio **congelado**, comprobante, referido, `is_cart` |
| `order_items` | Líneas del carrito |
| `order_assignments` | Qué se entregó por cada pedido |
| `payment_settings` | Fila única: SINPE, instrucciones, meta de referidos |
| `profile_rewards` | Recompensas ganadas por referir |
| `inbound_emails` | Correo entrante íntegro. Idempotencia por `message_id` |
| `verification_pins` | El producto final: el código |
| `notification_outbox` | Patrón *outbox*. Se llena, nadie lo consume todavía |
| `pin_change_requests` | El cliente pide cambiar el PIN de su perfil |
| `account_reports` | El cliente avisa de un problema con su cuenta |
| `push_subscriptions` | Suscripciones Web Push del operador |
| `page_views` | Contador de visitas de la portada |
| `audit_logs` | Quién vio qué PIN y quién entregó qué |

### Funciones de base de datos

`is_admin()` · `current_user_id()` · `has_account_access()` · `can_view_pin()`
· `sync_current_user()` · `ingest_inbound_email()` · `soltar_cuenta()`
· `crear_pedido_carrito()` · `catalogo_publico()` · `combos_publicos()`
· `resolve_referral_code()` · `reclamar_recompensa()` · `expire_due_assignments()`
· `generate_referral_code()` + triggers de inmutabilidad del referido
· `crear_renovacion()` · `aprobar_renovacion()` · `aplicar_cambio_pin()`
· `aplicar_rebajo_al_pedido()` · `consumir_rebajos()` · `devolver_rebajos()`
· `resumen_visitas()`

### Buckets de Storage (los dos privados)

- **`comprobantes`** — capturas de SINPE. Ruta `{uuid-cliente}/{uuid-pedido}.{ext}`.
  La primera carpeta **es** la autorización: la política compara contra
  `current_user_id()`. Se sirven con URL firmada de 10 minutos.
- **`multimedia`** — artes de publicidad del operador. Carpetas `imagenes/` y
  `videos/`. Las cuatro políticas exigen `is_admin()`. Tope 50 MB/archivo (es el
  techo del proyecto de Supabase, no un capricho). URL firmada de 1 hora.

---

## 7. Los flujos

### 7.1 Autenticación

Clerk emite la identidad; Supabase la valida contra el JWKS de Clerk y la expone
en `auth.jwt()`. **La autorización se queda en RLS.**

Hay dos identidades y conviene no confundirlas: el `sub` del JWT
(`user_2abc…`, externa) y el uuid de `user_profiles` (interna, a la que apuntan
todas las claves foráneas). `SessionUser.id` es **siempre la interna**.

El perfil se crea en el primer inicio de sesión con `sync_current_user()`, que
lee el `sub` del JWT y **nunca de sus parámetros** —aceptarlo por parámetro
permitiría apropiarse del perfil ajeno—. Se hace aquí y no en un webhook de Clerk
porque un webhook puede llegar tarde y el usuario recién registrado aterrizaría
en un dashboard sin perfil.

### 7.2 Correo → PIN

```
Netflix → netflix1@streamclick.xyz
        → Cloudflare Email Routing
        → Email Worker (postal-mime, firma HMAC-SHA256)
        → POST /api/webhooks/inbound-email
        → ingest_inbound_email()  [transacción: email + pin + outbox]
        → Supabase Realtime
        → LivePinCard en el navegador del cliente
```

Códigos de respuesta del webhook: `401` firma inválida · `200 duplicate`
· `200 ignored` (cuenta desconocida) · `200 unparsed` · `500` (el proveedor
reintenta; la idempotencia lo hace seguro).

**Dos relojes distintos, no fundirlos nunca:**

| Reloj | Cuánto | Qué significa |
| --- | --- | --- |
| `expires_at` (`pin_ttl_seconds`) | 15 min | Cuándo deja de servir **en Netflix** |
| `LIVE_PIN_WINDOW_SECONDS` | 5 min | Cuánto se queda en la tarjeta grande |

Aplicar los 5 minutos a `expires_at` haría que la app dijera «caducado» sobre un
código que aún funciona.

**Varios códigos a la vez:** los perfiles de una cuenta comparten buzón y el
correo no dice qué perfil lo pidió. Se muestran **todos** los de la ventana
(hasta `MAX_LIVE_PINS` = 4) con su hora y un aviso. Antes el segundo sustituía al
primero y quien pidió primero tomaba por suyo el código del otro.

### 7.3 Compra

```
Catálogo → carrito → /comprar → paga por SINPE desde su banco
        → sube la captura → status 'esperando_revision'
        → operador lo ve en /admin/pagos (contador en la navegación)
        → «Soltar cuenta» → soltar_cuenta() → perfil asignado
        → correo de credenciales por Resend
```

- El **precio se copia del servicio en el servidor**, nunca del formulario.
- `soltar_cuenta()` es una **función de base de datos**, no tres llamadas desde
  la app: el `FOR UPDATE ... SKIP LOCKED` dentro de la transacción es lo único
  que impide que un doble clic entregue el mismo perfil dos veces. Es idempotente.
- El operador **no elige** qué perfil se entrega. Todos los libres de una
  plataforma son equivalentes.
- Estados: `esperando_comprobante` → `esperando_revision` → `entregado` /
  `rechazado` / `cancelado`. Nadie borra pedidos.
- Si el pago es correcto pero no hay stock, devuelve `sin_cupos` y el pedido
  espera. Ese caso hay que verlo, no esconderlo.

### 7.4 Referidos y rebajos

Cada cliente tiene un código propio (`user_profiles.referral_code`, inmutable por
trigger). Se escribe al enviar el comprobante; `validate_order_referral()` lo
comprueba y rechaza el auto-referido.

La recompensa **ya no es un perfil regalado**: es un **rebajo de ₡1 000** en la
siguiente compra o renovación (`profile_rewards.discount_amount`). Sale más
barato que regalar un perfil entero y no consume inventario.

`orders.discount_amount` guarda cuánto se rebajó en ese pedido concreto. Sin esa
columna sería imposible saber después si un pedido de ₡3 000 era precio de lista
o un ₡4 000 con rebajo aplicado. Los rebajos se reservan con `consumir_rebajos()`
al crear el pedido y se devuelven con `devolver_rebajos()` si se rechaza.

### 7.5 Renovación

Una suscripción que se acerca al vencimiento muestra el botón de renovar dentro
de `VENTANA_RENOVACION_DIAS`. Se renueva **la asignación**, no la cuenta:
`crear_renovacion()` genera un pedido enlazado por `renewal_assignment_id` y
`aprobar_renovacion()` amplía la fecha en vez de asignar un perfil nuevo.

### 7.6 Soporte: cambio de PIN y reportes

Desde `/soporte` el cliente pide cambiar el PIN de su perfil
(`pin_change_requests`) o reporta un problema con su cuenta (`account_reports`).
Las dos colas caen en `/admin/solicitudes`. `aplicar_cambio_pin()` escribe el PIN
nuevo en el perfil y cierra la solicitud en una sola operación.

### 7.7 Avisos push al operador

Cuando entra un comprobante, el operador recibe una notificación en el teléfono.
El contenido viaja **cifrado de punta a punta** (RFC 8291): ni Google ni Apple
pueden leerlo. Los manejadores `push` y `notificationclick` viven en
`public/sw.js`; las suscripciones, en `push_subscriptions`.

Dos detalles que rompen esto si se tocan: `showNotification()` **debe** llamarse
siempre que llega un push —si no, el navegador muestra un aviso genérico y acaba
revocando el permiso— y al tocar la notificación se reutiliza una pestaña abierta
en lugar de abrir otra.

---

## 8. Decisiones que NO hay que deshacer

1. **La autorización vive en RLS, no en el código** (ADR-0003).
   `NEXT_PUBLIC_SUPABASE_URL` y la clave publicable viajan al navegador por
   diseño. Sin RLS, esa clave sirve para pedirle a PostgREST todas las filas de
   todas las tablas —correos, PIN, cuerpos de los correos de Netflix— sin pasar
   por Next.js ni por Clerk. Los guardias `requireUser()`/`requireAdmin()` son
   **defensa en profundidad**, no la frontera.

2. **Clean Architecture en `core/`, módulos verticales en `features/`** (ADR-0002).
   `core/` no importa nada de Next ni de Supabase.

3. **Las lecturas simples NO pasan por casos de uso** (ADR-0006). Un caso de uso
   que sólo reenvía al repositorio es indirección sin propósito.

4. **Server Actions para el usuario, Route Handlers para máquinas** (ADR-0005).

5. **Cobro por comprobante manual, no pasarela** (ADR-0009). SINPE no cobra
   comisión ni exige alta de comercio. El coste es una revisión humana por venta.
   Cuando llegue una pasarela, `soltar_cuenta()` no cambia: sólo cambia quién la
   llama.

6. **El service worker no cachea páginas.** La app muestra credenciales y códigos
   detrás de sesión; un worker que guardara navegaciones serviría el panel de un
   usuario al siguiente en el mismo teléfono, saltándose Clerk **y** RLS porque
   la respuesta ya está en disco. Sólo se cachea `/_next/static/*`.

7. **Las consultas devuelven `{ data, error }`,** no una lista pelada. Una lista
   vacía por error es indistinguible de una vacía de verdad, y esa ambigüedad ya
   costó un ciclo de depuración. Los errores se **muestran en pantalla**.

8. **Las secciones vacías no se ocultan:** muestran un estado explícito. Ocultar
   el catálogo cuando fallaba la consulta hizo imposible saber si el problema era
   la migración, el despliegue o el código.

---

## 9. Trampas ya pisadas (no reintroducir)

1. **`@supabase/ssr` < 0.12 rompe TODOS los tipos.** Síntoma: todo se resuelve a
   `never` («Property 'id' does not exist on type 'never'») en los ficheros que
   consultan, no donde está la causa.

2. **`database.types.ts` está escrito a mano y tiene forma obligatoria.** Cada
   tabla necesita `Row`, `Insert`, `Update` **y** `Relationships`; cada vista al
   menos `Row` y `Relationships`. Si falta cualquiera, todas las consultas pasan
   a `never`. `Update` nunca puede ser `never` (usar `Record<string, never>`).

3. **Las rutas con sesión necesitan `export const dynamic = 'force-dynamic'`.**
   Sin ello, `next build` falla al prerenderizar con un error que no señala la
   causa real.

4. **En Tailwind v4, `bg-[--color-x]` NO aplica ningún color.** Hay que escribir
   `bg-[var(--color-x)]`. Emite CSS inválido en silencio; se encontró con una
   captura de Playwright (un botón salía blanco en vez de negro).

5. **Un embed de PostgREST es ambiguo si hay dos claves foráneas** a la misma
   tabla (error `PGRST201`). Hay que calificarlo:
   `user_profiles!orders_user_id_fkey ( email )`.

6. **El webhook debe quedar FUERA del middleware de Clerk.** Si lo intercepta, el
   Worker recibe una redirección al login en lugar de un 200, los correos entran,
   Cloudflare los da por entregados y **ningún código llega jamás**. Hay un test
   que lo vigila (`tests/middleware-matcher.test.ts`). Lo mismo vale ahora para
   `/sw.js` y `/manifest.webmanifest`.

7. **`message.from` del Worker NO es la cabecera `From`** — es el remitente del
   sobre. Usar el `From` parseado. Sin esto se rechazan todos los correos
   legítimos y quedan como «sin código».

8. **`server-only` rompe Vitest.** Está aliasado a `node_modules/server-only/empty.js`.

9. **`suppressHydrationWarning` no se propaga a los elementos hijos.** Las cuentas
   atrás lo necesitan también en el `span` interno.

10. **Los patrones del parser necesitan hueco entre el ancla y el código**
    (`[^\d]{0,40}`): en los correos reales hay ~22 caracteres entre «código» y los
    dígitos. Y hay que probar **los dos cuerpos** del correo (texto y HTML), no
    elegir uno por longitud.

11. **`pkill -f "next dev"` mata la propia shell del agente** (exit 144) y deja
    restauraciones a medias. Matar por puerto o dejar morir el proceso.

12. **El service worker se sirve con `no-cache`.** Un `sw.js` cacheado es el
    clásico «desplegué el arreglo y en el móvil sigue igual», sin ningún error.

---

## 10. Deuda técnica reconocida

- **Cifrado de credenciales (ADR-0007):** AES-256-GCM con la clave en variable de
  entorno. Suficiente por ahora, no es un KMS.
- **Rate limiting en memoria** (`src/lib/rate-limit.ts`): no sobrevive entre
  instancias serverless.
- **`notification_outbox` sin consumidor.**
- **Parsers de Max y Prime Video** sin escribir.
- **Los combos no cambian el precio automáticamente** al variar el precio de un
  servicio: hay que revisarlo a mano.

---

## 11. Comandos

```bash
npm run dev                     # servidor de desarrollo
npm run typecheck               # tsc --noEmit
npm run lint
npm test                        # vitest run  (10 archivos, 75 tests)
npm run build

node scripts/build-setup-sql.mjs   # regenerar supabase/setup.sql tras cada migración
npm run diagnostico:correo         # dice CUÁL de los seis eslabones del correo falla
npm run secretos                   # generar secretos con el formato correcto
```

### Verificación visual (funciona y merece la pena)

Se levanta el servidor de desarrollo con un `.env.local` de mentira (clave de
Clerk con formato válido: `pk_test_` + base64 de `preview.clerk.accounts.dev$`),
se aparta `src/middleware.ts`, se crea una ruta `preview-*` con datos falsos y se
captura con Playwright:

```
executablePath: '/opt/pw-browsers/chromium'
args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>', '--ignore-certificate-errors']
```

**Restaurar siempre al terminar**: middleware, `.env.local` y la ruta temporal.

---

## 12. Cómo trabajar en este proyecto

- **Todo va a `main` y se pushea.** No hay ramas de feature.
- **Todo en español**: código, comentarios, mensajes de commit, interfaz.
  Registro costarricense en los textos de cara al cliente («podés», «ocupás»).
- **Comentarios que explican el porqué, no el qué.** El estándar del repositorio
  es alto: cada decisión no obvia lleva su justificación y, cuando existe, el
  fallo concreto que la motivó. Mantenerlo.
- **Mensajes de commit**: título en imperativo, cuerpo explicando la decisión y
  la alternativa descartada. Sin listas de archivos.
- **Antes de dar algo por terminado**: `typecheck` + `lint` + `test` + `build`, y
  verificación visual si se tocó interfaz.
- **Tras cada migración**: regenerar `setup.sql` y **darle al operador el SQL
  pegable en el chat** — trabaja desde el móvil y no puede correr la CLI.
- **Cada cambio de precio en una imagen promocional exige el `UPDATE`
  correspondiente** en `streaming_services`. Si el estado de WhatsApp dice ₡3 000
  y la web ₡3 500, esa discusión la pierde el operador.

---

## 13. Documentación de referencia

| Documento | Cuándo |
| --- | --- |
| `docs/01-arquitectura.md` | Estructura, capas, principios |
| `docs/02-esquema-base-de-datos.md` | Tablas, RLS, índices, vistas |
| `docs/03-flujo-autenticacion.md` | Registro, login, middleware |
| `docs/04-flujo-email-a-pin.md` | El pipeline y sus modos de fallo |
| `docs/05-integraciones-futuras.md` | WhatsApp, Telegram, push |
| `docs/06-despliegue.md` | Runbook completo |
| `docs/07-correo-entrante.md` | Cloudflare Email Routing y el Worker |
| `docs/08-migrar-cuenta-netflix.md` | Pasar una cuenta a un buzón del dominio |
| `docs/09-desplegar-sin-terminal.md` | Desplegar el Worker desde el móvil |
| `docs/10-flujo-de-compra.md` | SINPE, comprobantes y «Soltar cuenta» |
| `docs/10-correo-de-entrega-resend.md` | Correo de credenciales |
| `docs/11-avisos-de-pago.md` | Push al operador y **por qué se descartó WhatsApp** |
| `docs/adr/0001…0009` | **Por qué** se tomó cada decisión |
| `HANDOFF.md` | Traspaso anterior. Parcialmente desactualizado |

---

## 14. Lo primero que preguntar si algo no cuadra

1. ¿Está aplicada la última migración en Supabase? El operador las corre a mano
   desde el SQL Editor y a veces se salta una.
2. ¿Está desplegado el Worker de Cloudflare con la última versión?
   (Actions → «Desplegar Email Worker» → Run workflow.)
3. ¿Coinciden los precios de la base de datos con los de las imágenes que se
   están publicando?
4. ¿La plataforma en cuestión tiene parser, o sus códigos se reenvían a mano?
5. ¿Están configuradas las claves VAPID? Sin ellas los avisos push no salen y no
   hay ningún error visible.
