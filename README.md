# StreamClick

Plataforma SaaS para administrar cuentas compartidas de servicios de streaming.
Recibe el correo de verificación de Netflix, extrae el código automáticamente y lo
entrega **en tiempo real** al cliente correcto — y sólo a él.

## El problema que resuelve

Netflix envía los códigos de verificación al correo dueño de la cuenta, que
controla el operador y no el cliente final. Sin automatización, el operador
reenvía cada código a mano por WhatsApp mientras el código expira en 15 minutos.

StreamClick automatiza ese ciclo completo: correo entrante → extracción del PIN →
entrega instantánea al cliente que tiene ese perfil asignado.

## Stack

| Pieza | Tecnología |
| --- | --- |
| Framework | Next.js 15 · App Router · Server Components · Server Actions |
| Lenguaje | TypeScript en modo estricto |
| Estilos | Tailwind CSS v4 con tokens semánticos |
| Backend | Supabase — Auth, PostgreSQL con RLS, Realtime |
| Despliegue | Vercel |
| Tests | Vitest |

## Documentación

Cada decisión técnica relevante está justificada por escrito. Empieza por aquí:

| Documento | Contenido |
| --- | --- |
| [Arquitectura](docs/01-arquitectura.md) | Capas, estructura de carpetas, principios y decisiones transversales |
| [Esquema de base de datos](docs/02-esquema-base-de-datos.md) | Tablas, RLS, índices, vistas y el porqué de cada una |
| [Flujo de autenticación](docs/03-flujo-autenticacion.md) | Registro, login, middleware y separación autenticación/autorización |
| [Flujo correo → PIN](docs/04-flujo-email-a-pin.md) | El pipeline completo paso a paso, con sus modos de fallo |
| [Integraciones futuras](docs/05-integraciones-futuras.md) | WhatsApp, Telegram, push y cómo encajan en lo ya construido |
| **[Despliegue](docs/06-despliegue.md)** | **Runbook completo: Supabase, Vercel, dominio, correo entrante y verificación** |

### Decisiones registradas (ADR)

| ADR | Decisión |
| --- | --- |
| [0001](docs/adr/0001-supabase-como-backend.md) | Supabase como backend: RLS y Realtime son el mismo sistema |
| [0002](docs/adr/0002-clean-architecture-con-modulos-verticales.md) | Clean Architecture en `core/`, módulos verticales en `features/` |
| [0003](docs/adr/0003-rls-como-frontera-de-autorizacion.md) | RLS es la única frontera real de autorización |
| [0004](docs/adr/0004-sesion-en-cookies-con-supabase-ssr.md) | Sesión en cookies con `@supabase/ssr` |
| [0005](docs/adr/0005-server-actions-vs-route-handlers.md) | Server Actions para usuarios, Route Handlers para máquinas |
| [0006](docs/adr/0006-lecturas-directas-sin-caso-de-uso.md) | Las lecturas simples no pasan por casos de uso |
| [0007](docs/adr/0007-almacenamiento-de-credenciales.md) | Credenciales de streaming: cifrado y deuda técnica reconocida |

## Desplegar en producción

Sigue el **[runbook de despliegue](docs/06-despliegue.md)**: cubre Supabase,
Vercel, el dominio y el correo entrante de principio a fin, con las
verificaciones intermedias y una tabla de diagnóstico.

Resumen de las piezas y dónde vive cada una:

```
   Netflix
      │  correo a netflix1@streamclick.xyz
      ▼
   Cloudflare Email Routing  ──►  Email Worker  (workers/inbound-email/)
                                       │  POST firmado con HMAC
                                       ▼
   Vercel  ──►  Next.js  ──►  Supabase (Postgres + RLS + Realtime)
                                       │
                                       ▼
                             El PIN aparece en el dashboard
```

## Desarrollo local

### 1. Dependencias

```bash
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Genera los dos secretos criptográficos:

```bash
openssl rand -hex 32   # INBOUND_EMAIL_WEBHOOK_SECRET
openssl rand -hex 32   # CREDENTIALS_ENCRYPTION_KEY
```

Las claves de Supabase están en *Project Settings → API*. Todas las variables se
validan con zod al arrancar: si falta alguna, el proceso falla en el build en vez
de a las tres de la mañana cuando llegue el primer correo.

### 3. Base de datos

Con la CLI de Supabase:

```bash
supabase link --project-ref <tu-ref>
supabase db push          # aplica supabase/migrations/
npm run db:types          # regenera los tipos de TypeScript
```

O en local con Docker:

```bash
supabase start
supabase db reset
```

Si prefieres no instalar la CLI, pega [`supabase/setup.sql`](supabase/setup.sql)
en el SQL Editor de Supabase: es la concatenación de las mismas migraciones.
Regenéralo con `node scripts/build-setup-sql.mjs` tras añadir cualquier
migración nueva.

### 4. Primer administrador

Todos los usuarios se crean como `client` a propósito: un endpoint de
"registrarse como admin" sería una escalada de privilegios. Tras registrarte por
la interfaz, promociona tu usuario desde el SQL editor de Supabase:

```sql
update public.user_profiles set role = 'admin' where email = 'tu@correo.com';
```

### 5. Arrancar

```bash
npm run dev
```

## Probar el pipeline sin proveedor de correo

No hace falta contratar un proveedor ni esperar a que Netflix envíe un código
real:

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
node scripts/sign-payload.mjs tests/fixtures/netflix-household.json
```

El script imprime un `curl` firmado listo para ejecutar. Si tienes el dashboard
abierto con una cuenta cuyo correo de ingesta sea `netflix1@streamclick.com`, el
código aparecerá en pantalla sin recargar.

## Comandos

```bash
npm run dev        # servidor de desarrollo
npm run build      # build de producción
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm test           # Vitest
npm run db:push    # aplicar migraciones
npm run db:types   # regenerar tipos desde el esquema

node scripts/generate-secrets.mjs   # genera los dos secretos criptográficos
node scripts/build-setup-sql.mjs    # regenera supabase/setup.sql
```

## Estado actual

**Implementado**

- Autenticación completa: registro, login, recuperación, confirmación por correo.
- RLS en todas las tablas, con aislamiento por asignación **y** por ventana temporal.
- Ingesta de correo idempotente con verificación de firma HMAC.
- Parser de Netflix en español e inglés, con 29 tests en verde.
- Entrega de PIN en tiempo real vía Supabase Realtime, con re-sincronización al reconectar.
- Historial de códigos con fecha y hora.
- Panel de administración: inventario de cuentas, perfiles y asignaciones.

**Preparado pero no implementado**

- Canales WhatsApp, Telegram y push: el puerto `NotificationSender` y la tabla
  `notification_outbox` existen y se rellenan; falta el worker que los consuma.
- Parsers de Disney+ y Prime Video: el catálogo los contempla y quedan inactivos
  hasta tener correos reales con los que escribir sus tests.

**Deuda técnica reconocida**

- Las credenciales de streaming se cifran con una clave que vive en el entorno de
  la aplicación: protege frente a un volcado de la base de datos, no frente al
  compromiso del entorno. Ruta a producción en [ADR-0007](docs/adr/0007-almacenamiento-de-credenciales.md).
- El rate limiting es en memoria y por instancia. En Vercel eso no es un límite
  global; la protección real sería Upstash Redis o el firewall de Vercel.
