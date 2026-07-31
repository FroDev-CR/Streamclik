# ADR-0008 · Clerk como proveedor de identidad, con RLS intacto

**Estado:** aceptado · 2026-08-01
**Sustituye parcialmente a:** [ADR-0004](0004-sesion-en-cookies-con-supabase-ssr.md)
**No toca:** [ADR-0003](0003-rls-como-frontera-de-autorizacion.md)

## Contexto

Se decidió mover la autenticación de Supabase Auth a Clerk, por sus formularios
ya hechos, MFA y gestión de sesiones.

El riesgo no era la autenticación sino la **autorización**. Las 16 políticas RLS
resolvían la identidad con `auth.uid()`, que sólo devuelve algo para sesiones
emitidas por Supabase Auth. Con Clerk devuelve null siempre, así que las
políticas dejarían de conceder nada: la aplicación se vaciaría sin un solo error.

La salida tentadora era desactivar RLS y mover la autorización a TypeScript. Se
descartó por lo que eso significa aquí en concreto: `NEXT_PUBLIC_SUPABASE_URL` y
la clave publicable viajan al navegador por diseño y cualquiera las lee en el
código fuente de la página. Sin RLS, esa clave sirve para pedirle a PostgREST
todas las filas de todas las tablas —correos de clientes, PIN, cuerpos íntegros
de los correos de Netflix— sin pasar por Next.js ni por Clerk. Se comprobó contra
el proyecto real: la petición anónima responde 200 y devuelve `[]` únicamente
porque las políticas la filtran.

## Decisión

Clerk emite la identidad; Supabase la valida como **Third-Party Auth** contra el
JWKS de Clerk y expone sus claims en `auth.jwt()`. La autorización se queda donde
estaba.

1. `user_profiles.id` **sigue siendo uuid**. Cinco claves foráneas apuntan a esa
   columna; cambiar el tipo obligaría a reescribirlas todas con sus índices. El
   identificador de Clerk entra como columna nueva, `clerk_user_id text`.

2. `public.current_user_id()` traduce el `sub` del JWT al uuid interno y
   sustituye a `auth.uid()` en todo el esquema.

3. Los tres helpers (`is_admin`, `has_account_access`, `can_view_pin`) sólo
   cambian el valor por defecto de su parámetro. **El cuerpo no se toca**: quién
   puede ver qué no se está renegociando en esta migración, y mezclar ambas cosas
   haría el diff imposible de revisar.

4. El alta del perfil pasa del trigger sobre `auth.users` a
   `public.sync_current_user()`, que la aplicación llama tras autenticar.

## Consecuencias

**El claim `role: "authenticated"` es obligatorio** en el JWT de Clerk. Sin él
Postgres atiende la petición como `anon`, ninguna política concede nada y todo
devuelve vacío **sin ningún error visible**. Es el modo de fallo más
desconcertante de esta integración y el primero que hay que comprobar cuando "no
se ve nada".

**La identidad se lee del JWT, nunca de los parámetros.** `sync_current_user`
podría haber aceptado el `sub` como argumento; no lo hace porque entonces
cualquier usuario autenticado podría pedir el alta con el identificador de otro y
quedarse con su perfil y sus asignaciones.

**Desaparecen tres modos de fallo heredados de ADR-0004:** el middleware ya no
tiene que devolver el mismo objeto `NextResponse` que creó el cliente de Supabase
—origen de las sesiones que se caían cada hora sin notarse en desarrollo—, ya no
importa `getUser()` frente a `getSession()`, y no hay cookies de Supabase que
refrescar.

**El rol se sigue leyendo de `user_profiles`, no de los metadatos de Clerk**,
para que revocar admin surta efecto en la consulta siguiente y no cuando caduque
el token.

**Las claves actuales son de desarrollo** (`pk_test_`/`sk_test_`). Funcionan
contra la instancia `*.clerk.accounts.dev`; el dominio de producción necesitará
claves `pk_live_`/`sk_live_` y añadir ese dominio en Clerk.

## Trampa ya pisada

`drop policy if exists` con un nombre equivocado **no falla**: no encuentra nada,
sigue adelante, y el `create` posterior deja una política nueva conviviendo con
la vieja. Como las de SELECT se combinan con OR, no aparece ningún error — sólo
una política huérfana evaluando `auth.uid()` para siempre. Ocurrió con
`account_profiles` durante esta migración y se detectó contando políticas
(pasaron de 16 a 17), no probando la aplicación.

Verificación después de tocar políticas:

```sql
select count(*) from pg_policies where schemaname='public';                    -- 16
select count(*) from pg_policies where schemaname='public'
  and (coalesce(qual,'')||coalesce(with_check,'')) like '%auth.uid%';          -- 0
```
