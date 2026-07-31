# Despliegue en producción — streamclick.xyz

Guía completa desde cero hasta ver un código real en pantalla. Tiempo estimado:
40–60 minutos, la mayor parte esperando la propagación del DNS.

## Antes de empezar

**Nunca compartas estos valores por chat, correo o capturas de pantalla:**

- `SUPABASE_SERVICE_ROLE_KEY` — omite Row Level Security por completo. Quien la
  tenga lee y escribe toda la base de datos, incluidas las contraseñas de las
  cuentas de Netflix.
- `INBOUND_EMAIL_WEBHOOK_SECRET` — con él se pueden inyectar códigos falsos.
- `CREDENTIALS_ENCRYPTION_KEY` — descifra las credenciales almacenadas.

Van directamente del generador al panel de Vercel o de Cloudflare. En ningún
momento hace falta que pasen por otro sitio.

**Cuentas necesarias:** Supabase, Vercel y Cloudflare. Las tres tienen plan
gratuito suficiente para arrancar.

---

## Paso 1 — Base de datos en Supabase

### 1.1 Crear el proyecto

En [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

| Campo | Valor |
| --- | --- |
| Name | `streamclick` |
| Database Password | Genérala y guárdala en un gestor de contraseñas |
| Region | La más cercana a tus clientes (para Costa Rica, `East US (North Virginia)`) |

La región importa más de lo que parece: cada consulta del dashboard viaja hasta
ahí y vuelve. Con la región equivocada se añaden 150–200 ms a cada carga.

### 1.2 Crear el esquema

**SQL Editor** → **New query** → pega el contenido íntegro de
[`supabase/setup.sql`](../supabase/setup.sql) → **Run**.

Ese archivo concatena las ocho migraciones: tablas, índices, funciones de
autorización, políticas RLS, el RPC de ingesta, la configuración de Realtime y la
semilla del catálogo. Debe terminar sin errores.

> Si prefieres usar la CLI (`supabase link` + `supabase db push`), usa los
> archivos de `supabase/migrations/` e ignora `setup.sql`. Son el mismo SQL.

### 1.3 Comprobar que RLS quedó activo

Es la verificación más importante de todo el despliegue. Ejecuta en el SQL Editor:

```sql
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
 order by tablename;
```

**Las nueve tablas deben mostrar `rowsecurity = true`.** Si alguna sale en
`false`, sus datos serían legibles por cualquier usuario autenticado. No sigas
hasta corregirlo.

Comprueba también que Realtime está publicando:

```sql
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime';
```

Debe listar `verification_pins` y `profile_assignments`. Sin esto, los códigos se
guardan pero nunca aparecen solos en pantalla.

### 1.4 Configurar Auth

**Authentication → URL Configuration**

| Campo | Valor |
| --- | --- |
| Site URL | `https://streamclick.xyz` |
| Redirect URLs | `https://streamclick.xyz/auth/confirm` |

Si el Site URL se queda en `localhost`, los enlaces de confirmación que reciban
tus clientes apuntarán a su propia máquina y no podrán activar la cuenta.

**Authentication → Providers → Email:** deja **Confirm email** activado. Sin
confirmación, cualquiera puede registrarse con el correo de otra persona.

### 1.5 Copiar las claves

**Project Settings → API**. Necesitarás tres valores en el paso 3:

| Valor en Supabase | Variable de entorno |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

La clave `anon` es pública por diseño y es seguro que llegue al navegador,
**porque RLS está activo**. Por eso el paso 1.3 no es opcional.

---

## Paso 2 — Generar los secretos

En tu máquina, dentro del repositorio:

```bash
node scripts/generate-secrets.mjs
```

Imprime `INBOUND_EMAIL_WEBHOOK_SECRET` y `CREDENTIALS_ENCRYPTION_KEY`. Guárdalos
en tu gestor de contraseñas antes de continuar.

`CREDENTIALS_ENCRYPTION_KEY` **no se puede rotar sin más**: al cambiarla, las
contraseñas de Netflix ya guardadas quedan ilegibles. No hay migración
automática.

---

## Paso 3 — Aplicación en Vercel

### 3.1 Importar el repositorio

[vercel.com/new](https://vercel.com/new) → importa `FroDev-CR/Streamclik`.

- **Framework Preset:** Next.js (se detecta solo)
- **Root Directory:** raíz del repositorio, sin cambios
- **Branch:** `claude/streamclick-saas-architecture-ad9wlm` mientras no se haya
  fusionado a la rama principal

### 3.2 Variables de entorno

Antes de desplegar, añade las seis en **Environment Variables**, marcadas para
*Production*, *Preview* y *Development*:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
INBOUND_EMAIL_WEBHOOK_SECRET=<el generado en el paso 2>
CREDENTIALS_ENCRYPTION_KEY=<el generado en el paso 2>
NEXT_PUBLIC_SITE_URL=https://streamclick.xyz
```

Las seis son obligatorias: se validan con zod al arrancar y el build falla si
falta alguna. Es deliberado — es preferible un build roto a una aplicación en
producción que falla la primera vez que llega un correo.

### 3.3 Desplegar

**Deploy**. El build tarda 1–2 minutos. Al terminar tendrás una URL
`streamclick-xxx.vercel.app` funcional.

Comprueba que responde:

```bash
curl https://streamclick-xxx.vercel.app/api/health
# {"status":"ok","service":"streamclick","timestamp":"..."}
```

---

## Paso 4 — Dominio streamclick.xyz

### 4.1 DNS en Cloudflare

Aunque el dominio esté registrado en otro sitio, conviene gestionar el DNS en
Cloudflare: el correo entrante del paso 5 lo requiere.

En Cloudflare → **Add a site** → `streamclick.xyz` → plan Free. Cloudflare te dará
dos nameservers; cámbialos en el panel de tu registrador. La propagación tarda
entre 5 minutos y 24 horas.

### 4.2 Añadir el dominio en Vercel

Proyecto en Vercel → **Settings → Domains** → añade `streamclick.xyz` y
`www.streamclick.xyz`.

Vercel te mostrará **los registros DNS exactos** que debes crear en Cloudflare.
Usa los que muestre el panel, no valores copiados de un tutorial: Vercel los ha
cambiado en el pasado y un registro obsoleto deja el dominio sin resolver.

Dos detalles que causan la mayoría de los problemas:

1. **Pon los registros de Vercel en modo "DNS only" (nube gris), no "Proxied"
   (nube naranja).** Con el proxy de Cloudflare activado sobre un dominio de
   Vercel se producen bucles de certificado y errores 526.
2. **No borres los registros MX** que añadirá el paso 5. Los MX (correo) y los
   A/CNAME (web) conviven sin problema: son tipos distintos.

Cuando Vercel muestre el dominio como *Valid*, actualiza en Supabase el **Site
URL** y las **Redirect URLs** al dominio definitivo si aún no lo hiciste.

---

## Paso 5 — Correo entrante

Es lo que hace que el producto exista. Sin este paso la aplicación funciona pero
nunca recibe un código.

### 5.1 Activar Email Routing

Cloudflare → dominio `streamclick.xyz` → **Email → Email Routing** → **Get
started**. Cloudflare añade automáticamente los registros MX necesarios.

Añade y verifica una **Destination address** (tu correo personal). Cloudflare te
enviará un correo de confirmación; hace falta para la red de seguridad del paso
5.3.

### 5.2 Desplegar el Worker

```bash
cd workers/inbound-email
npm install
npx wrangler login
npx wrangler secret put INBOUND_EMAIL_WEBHOOK_SECRET
npx wrangler deploy
```

Cuando `wrangler secret put` pida el valor, pega **exactamente el mismo**
`INBOUND_EMAIL_WEBHOOK_SECRET` que pusiste en Vercel. Si no coinciden, el webhook
responde 401 a todo y ningún código llega nunca. Es el fallo más común de esta
integración.

### 5.3 Enrutar el correo al Worker

Cloudflare → **Email → Email Routing → Routes** → **Catch-all address**:

- Action: **Send to a Worker**
- Destination: `streamclick-inbound-email`
- **Save**

El catch-all es lo que permite crear `netflix1@`, `netflix2@`, `disney1@`… sin
configurar nada nuevo por cada cuenta.

Opcional pero recomendable: descomenta `FORWARD_TO` en `wrangler.toml` con tu
correo verificado y vuelve a desplegar. Si la aplicación se cae, el correo se
reenvía a un buzón real y el código puede leerse a mano en vez de perderse.

---

## Paso 6 — Primer administrador

Todos los usuarios se crean como `client` a propósito: un endpoint de
"registrarse como admin" sería una escalada de privilegios auto-servida.

1. Ve a `https://streamclick.xyz/registro` y crea tu cuenta.
2. Abre el enlace de confirmación que recibirás por correo.
3. En el SQL Editor de Supabase:

```sql
update public.user_profiles
   set role = 'admin'
 where email = 'tu@correo.com';
```

4. Cierra sesión y vuelve a entrar. Ya verás **Administración** en la cabecera.

---

## Paso 7 — Verificación de extremo a extremo

### 7.1 Crear una cuenta de streaming

En `https://streamclick.xyz/admin` → **Añadir cuenta**:

| Campo | Valor |
| --- | --- |
| Servicio | Netflix |
| Nombre interno | `Netflix 01` |
| Correo de ingesta | `netflix1@streamclick.xyz` |
| Correo de acceso | El correo real de tu cuenta de Netflix |
| Contraseña | La contraseña real (se cifra antes de guardarse) |
| Número de perfiles | 5 |

**El correo de ingesta debe estar en tu dominio** (`@streamclick.xyz`). Es la
dirección que Cloudflare enruta al Worker y con la que la aplicación identifica
la cuenta.

En Netflix, cambia el correo de la cuenta a `netflix1@streamclick.xyz` para que
los códigos lleguen aquí.

### 7.2 Asignar un perfil

En la misma pantalla, junto a *Perfil 1*: elige un cliente (puedes usar tu propio
usuario para probar), pon una fecha de vencimiento y pulsa **Asignar**.

### 7.3 Probar sin esperar a Netflix

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
export WEBHOOK_URL=https://streamclick.xyz/api/webhooks/inbound-email
node scripts/sign-payload.mjs tests/fixtures/netflix-household.json
```

El fixture ya viene dirigido a `netflix1@streamclick.xyz`. Ejecuta el `curl` que
imprime el script: debe responder `{"status":"created","pinId":"..."}` y el
código **4821** debe aparecer en tu dashboard **sin recargar la página**.

Si el código se guarda pero no aparece solo, el problema está en Realtime
(paso 1.3), no en la ingesta.

### 7.4 Probar con correo real

Envía un correo desde tu cuenta personal a `netflix1@streamclick.xyz` con el
asunto "Prueba" y el cuerpo "Tu código de verificación es 998877".

No aparecerá ningún código, y eso es **correcto**: el parser rechaza remitentes
que no sean de un dominio de Netflix, precisamente para que un correo de phishing
no pueda inyectar un código falso. Comprueba con `npx wrangler tail` que llegó y
que el `outcome` fue `{"status":"unparsed"}`.

La prueba definitiva es solicitar un código real desde Netflix.

---

## Diagnóstico de problemas

| Síntoma | Causa probable | Comprobación |
| --- | --- | --- |
| El build de Vercel falla con "Variables de entorno inválidas" | Falta o sobra una variable | Revisa las seis en Settings → Environment Variables |
| Entro pero el dashboard sale vacío | Sin asignación activa, o RLS bloqueando | `select * from profile_assignments where user_id = '<tu-uuid>';` |
| El código llega a la BD pero no aparece solo | Realtime no publica la tabla | Consulta de `pg_publication_tables` del paso 1.3 |
| El Worker registra 401 | Los secretos no coinciden | Vuelve a ejecutar `wrangler secret put` con el valor de Vercel |
| El Worker registra `{"status":"ignored"}` | Ninguna cuenta usa esa dirección de ingesta | Revisa `inbox_email` en `/admin`; debe coincidir exactamente |
| El Worker registra `{"status":"unparsed"}` | El correo no traía código, o el remitente no es Netflix | Normal en correos de prueba |
| No llega ningún correo | Falta el catch-all, o los MX no propagaron | `dig MX streamclick.xyz` debe devolver los de Cloudflare |
| El enlace de confirmación va a localhost | Site URL sin actualizar | Supabase → Authentication → URL Configuration |

Para ver qué llegó realmente y por qué falló el parsing:

```sql
select received_at, from_address, subject, parse_status, parse_error
  from inbound_emails
 order by received_at desc
 limit 20;
```

Esa tabla guarda el cuerpo íntegro de cada correo justamente para esto: cuando un
correo real no se parsea, su contenido es el material para escribir el test de
regresión y corregir el patrón.

---

## Después del despliegue

Dos cosas quedan pendientes y conviene planificarlas antes de tener clientes de
pago:

1. **Endurecer el almacenamiento de credenciales.** La clave de cifrado vive en
   el entorno de la aplicación: protege frente a un volcado de la base de datos,
   no frente al compromiso del entorno. Ruta a producción en
   [ADR-0007](adr/0007-almacenamiento-de-credenciales.md).

2. **Caducar las asignaciones automáticamente.** La función
   `expire_due_assignments()` existe pero nadie la llama. Programa un cron en
   Supabase (**Database → Cron Jobs**):

   ```sql
   select cron.schedule(
     'expirar-asignaciones',
     '*/15 * * * *',
     $$ select public.expire_due_assignments() $$
   );
   ```

   Importa para la seguridad, no sólo para el reporte: una asignación vencida
   pero aún marcada como `active` seguiría concediendo acceso a los códigos.
