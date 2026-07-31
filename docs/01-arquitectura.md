# Arquitectura de StreamClick

> Documento maestro de arquitectura. Cada decisión relevante está justificada y,
> cuando implica una alternativa descartada, se registra además como ADR en
> `docs/adr/`.

## 1. Visión del producto

StreamClick es un SaaS multi-tenant para revendedores de cuentas compartidas de
streaming. El operador (administrador) compra cuentas de Netflix, las carga en la
plataforma, asigna perfiles a sus clientes finales y cobra por ese acceso.

El problema real que resuelve la plataforma: Netflix envía **códigos de
verificación temporales** (household / inicio de sesión) al correo dueño de la
cuenta. Ese correo lo controla el operador, no el cliente. Sin StreamClick el
operador tiene que reenviar el código manualmente por WhatsApp, uno por uno, con
minutos de retraso, mientras el código expira en ~15 minutos.

StreamClick automatiza ese ciclo completo: correo entrante → extracción del PIN →
entrega en tiempo real al cliente correcto, y **solo** al cliente correcto.

## 2. Principios rectores

| Principio | Cómo se materializa |
| --- | --- |
| **Dependency Rule** (Clean Architecture) | `core/` no importa nada de Next.js ni de Supabase. Las dependencias apuntan siempre hacia adentro. |
| **SRP** | Un caso de uso = una operación de negocio. Un repositorio = un agregado. |
| **OCP** | Añadir Disney+ o Prime Video = registrar un parser nuevo, sin tocar el pipeline de ingesta. |
| **LSP / ISP** | Los puertos son interfaces pequeñas y específicas (`PinRepository`, `NotificationSender`), no un `IRepository` genérico. |
| **DIP** | Los casos de uso reciben puertos por constructor; el *composition root* (`src/infrastructure/container.ts`) decide la implementación concreta. |
| **Seguridad por defecto** | RLS activo en todas las tablas. La UI nunca es la frontera de seguridad; la base de datos lo es. |
| **Idempotencia** | La ingesta de correo es idempotente por `message_id`: reintentos del proveedor no duplican PIN. |

## 3. Capas

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRESENTACIÓN — src/app, src/features/*/components, src/components   │
│  Next.js App Router · Server Components · Server Actions · Realtime  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ invoca casos de uso
┌───────────────────────────────▼──────────────────────────────────────┐
│  APLICACIÓN — src/core/use-cases                                     │
│  Orquesta reglas de negocio. No sabe qué es HTTP ni qué es Postgres. │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ depende de puertos (interfaces)
┌───────────────────────────────▼──────────────────────────────────────┐
│  DOMINIO — src/core/domain, src/core/ports, src/core/shared          │
│  Entidades, value objects, invariantes, Result<T,E>, contratos.      │
│  CERO dependencias externas (solo zod para validación de VOs).       │
└───────────────────────────────▲──────────────────────────────────────┘
                                │ implementa puertos
┌───────────────────────────────┴──────────────────────────────────────┐
│  INFRAESTRUCTURA — src/infrastructure                                │
│  Supabase (Auth/PG/Realtime) · parsers de email · notificaciones     │
└──────────────────────────────────────────────────────────────────────┘
```

**Regla mecánica de revisión:** si un archivo bajo `src/core/` contiene el string
`next/`, `@supabase` o `process.env`, la capa está contaminada. Es el chequeo más
barato para mantener la arquitectura honesta con el tiempo.

### ¿Por qué Clean Architecture en un MVP?

La crítica habitual es que añade ceremonia. Aquí se paga sola por tres razones
concretas del dominio:

1. **La lógica de parsing es el núcleo del valor** y debe ser testeable sin
   levantar Next ni Postgres. Los tests de `NetflixEmailParser` corren en
   milisegundos porque el parser es una función pura.
2. **Los canales de entrega van a multiplicarse** (WhatsApp, Telegram, push). Un
   puerto `NotificationSender` evita que el pipeline de ingesta se convierta en
   un `if` gigante.
3. **Supabase es reemplazable en teoría, pero acoplarse a él es una decisión, no
   un accidente.** Los repositorios aíslan la sintaxis de PostgREST del dominio.

Donde *no* se aplica ceremonia: no hay DTOs redundantes entre capas ni mappers
bidireccionales para lecturas simples. Las páginas de solo-lectura consultan
vistas de Postgres directamente desde Server Components. Ver ADR-0006.

## 4. Estructura de carpetas

```
src/
├── app/                                # Next.js App Router (rutas + Server Actions)
│   ├── (marketing)/                    # Landing pública
│   ├── (auth)/                         # login · registro · recuperar contraseña
│   ├── (dashboard)/                    # Área privada (layout con guard de sesión)
│   │   ├── dashboard/                  # Vista cliente: mis cuentas + PIN en vivo
│   │   └── admin/                      # Vista operador: cuentas, perfiles, asignaciones
│   ├── auth/                           # Route handlers de callback/confirm de Supabase
│   └── api/
│       ├── health/                     # Liveness para monitoreo
│       └── webhooks/inbound-email/     # Entrada del proveedor de correo
│
├── core/                               # ⚠️ Framework-agnostic. No importar Next ni Supabase.
│   ├── shared/                         # Result, errores tipados, tipos comunes
│   ├── domain/
│   │   ├── entities/                   # StreamingAccount, AccountProfile, VerificationPin…
│   │   └── value-objects/              # EmailAddress, PinCode, AccountAlias
│   ├── ports/                          # Interfaces: repositorios y servicios
│   └── use-cases/                      # Un archivo = una operación de negocio
│
├── infrastructure/
│   ├── supabase/                       # Clientes (browser, server, admin) + tipos generados
│   ├── repositories/                   # Implementaciones de los puertos sobre Supabase
│   ├── email/
│   │   ├── parsers/                    # Estrategias por servicio (Netflix, …) + registry
│   │   └── providers/                  # Normalización y verificación de firma del webhook
│   ├── notifications/                  # Outbox + canales (noop hoy, WhatsApp/Telegram luego)
│   └── container.ts                    # Composition root (única fábrica de dependencias)
│
├── features/                           # Módulos verticales de UI
│   ├── auth/                           # Formularios + Server Actions de sesión
│   ├── accounts/                       # Tarjetas de cuenta, detalle, credenciales
│   ├── pins/                           # Visor de PIN en vivo, historial, hook de Realtime
│   └── admin/                          # Gestión de cuentas y asignaciones
│
├── components/ui/                      # Design system: Button, Card, Badge, Input…
├── lib/                                # Transversal: env, logger, utils, rate-limit
└── middleware.ts                       # Refresco de sesión + protección de rutas

supabase/migrations/                    # Esquema versionado (fuente de verdad de la BD)
docs/                                   # Este documento, esquema, flujos y ADRs
tests/                                  # Vitest: unitarios de dominio, parsers y casos de uso
```

**Por qué `features/` además de `core/`:** `core/` organiza por *capa* (regla de
dependencia), `features/` organiza por *módulo vertical de UI* (cohesión de
pantallas). Mezclar ambas cosas en una sola carpeta es lo que hace que los
proyectos Next se vuelvan inmanejables hacia el mes seis. Ver ADR-0002.

## 5. Modelo de dominio (resumen)

| Entidad | Responsabilidad | Invariante clave |
| --- | --- | --- |
| `StreamingService` | Catálogo (Netflix, Disney+…) y sus reglas de parsing | Slug único |
| `StreamingAccount` | Cuenta comprada por el operador; tiene un **correo de ingesta único** | `inbox_email` único y normalizado |
| `AccountProfile` | Slot/perfil dentro de la cuenta ("Perfil 1") | Un perfil activo pertenece a ≤ 1 cliente |
| `ProfileAssignment` | Relación cliente ↔ perfil, con vigencia | No solapar asignaciones activas del mismo perfil |
| `InboundEmail` | Correo crudo recibido (auditoría + idempotencia) | `message_id` único |
| `VerificationPin` | Código extraído, con tipo y expiración | Pertenece a una cuenta; `expires_at > received_at` |
| `NotificationOutbox` | Entrega pendiente a canales externos | Reintentos con backoff |

Detalle completo en [`02-esquema-base-de-datos.md`](./02-esquema-base-de-datos.md).

## 6. Decisiones técnicas transversales

### 6.1 Server Components por defecto, Client Components por excepción

Todo se renderiza en el servidor salvo lo que necesita interactividad o
suscripción Realtime. En la práctica solo son `"use client"`:

- `LivePinCard` — se suscribe al canal de Realtime.
- Formularios con estado de envío (`useActionState`).
- Toggles de UI (mostrar/ocultar contraseña, copiar al portapapeles).

**Beneficio concreto:** la lista de cuentas del dashboard nunca viaja al cliente
como JSON de una API; se consulta con la sesión del usuario en el servidor y se
envía HTML. Menos superficie de fuga de datos y menos JS en el bundle.

### 6.2 Server Actions para mutaciones, Route Handlers para máquinas

- **Server Actions** — login, registro, crear cuenta, asignar perfil. Vienen con
  protección CSRF de Next, validación con zod en el servidor y `revalidatePath`.
- **Route Handlers** — solo para consumidores no-navegador: el webhook del
  proveedor de correo y el health check. Ver ADR-0005.

### 6.3 Dos clientes de Supabase, nunca mezclados

| Cliente | Fichero | Clave | Uso |
| --- | --- | --- | --- |
| Servidor (sesión de usuario) | `supabase/server.ts` | `anon` + cookies | Server Components y Server Actions. **RLS aplica.** |
| Navegador | `supabase/client.ts` | `anon` | Solo suscripción Realtime. **RLS aplica.** |
| Administrativo | `supabase/admin.ts` | `service_role` | **Solo** el webhook de ingesta. **RLS se omite.** |

`admin.ts` importa `server-only` y lanza en tiempo de importación si detecta un
bundle de cliente. Es la protección más importante del repositorio: filtrar la
`service_role` key equivale a entregar la base de datos completa.

### 6.4 La seguridad vive en Postgres

La autorización no se implementa en React ni en los casos de uso: se implementa
en políticas RLS. Los casos de uso pueden equivocarse; una política RLS aplica
igual desde la app, desde Realtime y desde un cliente REST manual con un JWT
robado. La UI solo *refleja* esos permisos. Ver ADR-0003.

### 6.5 Tailwind CSS v4 con tokens semánticos

Se usa `@theme` con variables CSS (`--color-surface`, `--color-accent`) en vez de
colores crudos en las clases. Cambiar la identidad visual o añadir modo claro es
editar `globals.css`, no 40 componentes.

## 7. Despliegue

| Recurso | Plataforma | Nota |
| --- | --- | --- |
| App Next.js | Vercel | Runtime Node para el webhook (necesita `crypto` y la service key). |
| Base de datos, Auth, Realtime | Supabase | Migraciones aplicadas con `supabase db push` desde CI. |
| Recepción de correo | Proveedor de inbound email | Resend Inbound / Cloudflare Email Workers / Postmark. Adaptador desacoplado. |

Variables de entorno documentadas en `.env.example` y validadas con zod al
arrancar (`src/lib/env.ts`): si falta una variable, el proceso falla en el build,
no en producción a las 3 de la mañana.

## 8. Qué está fuera del MVP (y dónde encaja después)

| Funcionalidad | Punto de extensión ya preparado |
| --- | --- |
| WhatsApp / Telegram / Push | Puerto `NotificationSender` + tabla `notification_outbox` |
| Cobros y suscripciones | Tabla `profile_assignments.expires_at` ya modela vigencia |
| Más servicios de streaming | `streaming_services` + registro de parsers |
| Panel de métricas | `audit_logs` ya registra accesos a PIN |
