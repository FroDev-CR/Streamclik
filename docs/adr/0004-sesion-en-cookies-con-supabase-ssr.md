# ADR-0004 — Sesión en cookies con `@supabase/ssr`

- **Estado:** Aceptada
- **Fecha:** 2026-07-31

## Contexto

El requisito pide "Server Components cuando sea conveniente". Un Server Component
solo puede renderizar datos privados si tiene acceso a la sesión del usuario en el
servidor, y eso depende enteramente de dónde se guarde el token.

## Decisión

`@supabase/ssr` con persistencia en cookies (`httpOnly`, `Secure`, `SameSite=Lax`),
tres clientes separados por contexto:

| Fichero | Clave | Contexto | RLS |
| --- | --- | --- | --- |
| `supabase/server.ts` | `anon` + cookies | Server Components / Actions | Aplica |
| `supabase/client.ts` | `anon` | Navegador (solo Realtime) | Aplica |
| `supabase/admin.ts` | `service_role` | Solo webhook de ingesta | **Se omite** |

`admin.ts` importa `server-only`: si algún día un import lo arrastra a un bundle
de cliente, el build falla en vez de publicar la llave maestra en un JS público.

## Por qué no `localStorage`

Es el default del SDK clásico de Supabase y es incompatible con el objetivo:

- Los Server Components no pueden leer `localStorage`. Todo el dashboard tendría
  que ser `"use client"` con un spinner de carga en cada pantalla.
- Los datos privados viajarían como JSON a través de una API en vez de renderizarse
  como HTML en el servidor.
- El token queda accesible a cualquier script de la página (superficie XSS).

## Detalles de implementación que son bugs esperando

**1. `getUser()` y no `getSession()` en el middleware.** `getSession()` decodifica
la cookie sin verificar la firma contra el servidor de Auth: una cookie manipulada
pasaría el chequeo. `getUser()` valida contra Supabase. En una frontera de
seguridad, la diferencia es todo.

**2. Reutilizar el objeto `NextResponse`.** El SDK escribe las cookies refrescadas
sobre la respuesta que se le pasa. Crear un `NextResponse` nuevo al final del
middleware descarta el token refrescado y el usuario pierde la sesión cada hora —
un bug que no aparece en desarrollo porque las sesiones son recientes.

**3. `cookies()` es asíncrono en Next 15.** `await cookies()` es obligatorio; el
cliente de servidor es por tanto una función `async`.

## Consecuencias

- Sesión compartida entre servidor y navegador sin sincronización manual.
- El middleware corre en cada navegación (coste ~10 ms) porque debe refrescar el
  token.
- Los tokens no son accesibles desde JavaScript del cliente.
