# ADR-0001 — Supabase como backend (Auth + Postgres + Realtime)

- **Estado:** Aceptada
- **Fecha:** 2026-07-31

## Contexto

StreamClick necesita tres capacidades no negociables: autenticación de usuarios,
una base de datos relacional con autorización fina por fila, y entrega en tiempo
real de los PIN sin que el cliente refresque.

## Alternativas consideradas

| Opción | Autenticación | Autorización por fila | Realtime | Coste operativo |
| --- | --- | --- | --- | --- |
| **Supabase** | Incluida | RLS nativo de Postgres | Incluido | Bajo |
| Firebase | Incluida | Security Rules (no SQL) | Excelente | Bajo, pero sin SQL relacional |
| Postgres propio + NextAuth + Pusher | Manual | Manual en la app | Servicio aparte | Alto: 3 sistemas que integrar |
| PlanetScale + Clerk + Ably | Externa | Manual | Externo | Alto y con 3 facturas |

## Decisión

Supabase.

El factor decisivo no es el precio ni la comodidad, es que **RLS y Realtime son el
mismo sistema**. Supabase Realtime evalúa las políticas RLS por suscriptor sobre
el stream de replicación. Eso significa que la regla "un cliente solo ve los PIN de
sus cuentas asignadas" se escribe **una vez, en SQL**, y aplica simultáneamente a:

- las consultas de los Server Components,
- las suscripciones WebSocket,
- cualquier petición REST directa con un JWT robado.

Con la combinación Postgres + Pusher habría que reimplementar esa autorización en
el emisor de eventos, y sería una segunda implementación que puede divergir de la
primera. En un producto cuyo activo es "el cliente correcto ve el código correcto",
tener dos fuentes de verdad para la autorización es el riesgo principal.

Firebase se descarta porque el dominio es claramente relacional (cuentas → perfiles
→ asignaciones → PIN, con vigencias temporales solapadas) y las Security Rules no
expresan bien "asignación activa cuya ventana temporal contiene `received_at`".

## Consecuencias

**Positivas**
- Una sola definición de autorización, en SQL, versionada en migraciones.
- Postgres real: índices únicos parciales, `tstzrange`, PL/pgSQL para atomicidad.
- Menos código propio de infraestructura que mantener.

**Negativas**
- Acoplamiento a un proveedor. Se mitiga con el patrón repositorio: la sintaxis de
  PostgREST vive solo en `src/infrastructure/repositories/`.
- La `service_role` key salta RLS por completo. Se contiene en `admin.ts` con
  `server-only` y se usa exclusivamente en el webhook de ingesta.
- Depurar RLS es más difícil que depurar un `if` en TypeScript. Se compensa con
  documentación explícita de la matriz de acceso.
