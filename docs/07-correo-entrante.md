# Poner en marcha el correo entrante

Guía enfocada en **lo que falta**, verificado contra el estado real del dominio a
fecha 2026-08-01.

## Estado comprobado

Consultado por DNS desde fuera, `streamclick.xyz` ya tiene resuelto lo más
lento de todo el proceso:

| Comprobación | Estado | Valor real |
| --- | --- | --- |
| Nameservers | ✅ Cloudflare autoritativo | `dell.ns.cloudflare.com`, `sage.ns.cloudflare.com` |
| Resolución web | ✅ Apunta a Vercel | `216.198.79.65`, `64.29.17.1` |
| **Registros MX** | ✅ **Email Routing activo** | `route1/2/3.mx.cloudflare.net` |

Es decir: **el dominio ya puede recibir correo**. Los mensajes a
`netflix1@streamclick.xyz` llegan a Cloudflare y no rebotan.

Lo que falta es la última milla: decirle a Cloudflare **qué hacer** con ese
correo, y que exista una cuenta en la aplicación que lo reclame.

---

## Lo que falta, en orden

### 1. Desplegar el Worker

```bash
cd workers/inbound-email
npm install
npx wrangler login
npx wrangler secret put INBOUND_EMAIL_WEBHOOK_SECRET
npx wrangler deploy
```

Cuando pida el secreto, pega **exactamente el mismo valor** que tiene
`INBOUND_EMAIL_WEBHOOK_SECRET` en Vercel. No lo generes de nuevo: si los dos
lados no coinciden byte a byte, el webhook responde 401 a todo y ningún código
llega jamás. Es el fallo más común de esta integración y el más difícil de
diagnosticar, porque todo lo demás parece funcionar.

Para copiarlo sin errores de transcripción:

```bash
# Con Vercel CLI, desde la raíz del repositorio
vercel env pull .env.production.local
grep INBOUND_EMAIL_WEBHOOK_SECRET .env.production.local
```

### 2. Enrutar el correo al Worker

Cloudflare → dominio `streamclick.xyz` → **Email → Email Routing → Routes**

En **Catch-all address**:

- Action: **Send to a Worker**
- Destination: `streamclick-inbound-email`
- **Save**

El catch-all es lo que permite crear `netflix1@`, `netflix2@`, `disney1@`… sin
volver a tocar Cloudflare por cada cuenta que compres.

> Verifica también una **Destination address** (tu correo personal) aunque no
> uses el reenvío todavía: hace falta para activar `FORWARD_TO`, que es la red de
> seguridad si la aplicación se cae.

### 3. Crear el primer administrador

Todos los usuarios nacen como `client` a propósito. Tras registrarte en
`https://streamclick.xyz/registro`, en el SQL Editor de Supabase:

```sql
update public.user_profiles
   set role = 'admin'
 where email = 'tu@correo.com';
```

Cierra sesión y vuelve a entrar para que se recargue el rol.

> **Si entras pero no ves nada**, no es esto: es el claim `role: "authenticated"`
> que falta en el JWT de Clerk. Ver la nota de ADR-0008 — sin ese claim Postgres
> atiende la petición como `anon`, ninguna política concede nada y todo sale
> vacío sin ningún error visible.

### 4. Crear la cuenta con su buzón

En `https://streamclick.xyz/admin` → **Añadir cuenta**. El campo decisivo es
**Correo de ingesta**: `netflix1@streamclick.xyz`.

Debe coincidir **exactamente** con la dirección a la que enviarás el correo. La
aplicación normaliza a minúsculas y descarta sub-direcciones (`netflix1+lo-que-sea@`
se resuelve como `netflix1@`), pero el nombre del buzón tiene que ser el mismo.

Después, asígnate a ti mismo el *Perfil 1* para poder ver los códigos.

---

## Verificación

### Diagnóstico automático

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
npm run diagnostico:correo
```

Recorre los seis eslabones y dice cuál falla:

1. **DNS** — nameservers y resolución
2. **MX** — si el dominio puede recibir correo
3. **Aplicación** — `/api/health`
4. **Webhook alcanzable** — que Clerk **no** lo esté interceptando
5. **Firma exigida** — que una petición sin firmar reciba 401
6. **Ingesta firmada** — envío real de extremo a extremo

Opciones:

```bash
npm run diagnostico:correo -- https://streamclik.vercel.app   # otra URL
INBOX_EMAIL=netflix2@streamclick.xyz npm run diagnostico:correo
```

Cómo leer el paso 6:

| Resultado | Significado |
| --- | --- |
| `created` | ✅ Todo funciona. El código **4821** debe aparecer en el dashboard sin recargar. |
| `ignored` | La ingesta va bien, pero ninguna cuenta usa ese buzón. Falta el paso 4. |
| `unparsed` | Llegó y se guardó, pero sin código. Normal si cambiaste el texto. |
| `duplicate` | Ya se procesó ese `messageId`. La idempotencia funcionando. |
| `401` | Los secretos no coinciden entre tu `.env.local` y Vercel. |
| `500` | Error de Supabase. Revisa `SUPABASE_SERVICE_ROLE_KEY` y los logs de Vercel. |

> El diagnóstico prueba la aplicación, no Cloudflare. Si el paso 6 da `created`
> pero un correo real no llega, el problema está en el Worker o en el catch-all.

### Prueba con correo real

```bash
cd workers/inbound-email && npx wrangler tail
```

Con eso abierto, envía un correo desde tu cuenta personal a
`netflix1@streamclick.xyz`. Deberías ver `"Correo entregado al webhook"`.

**No aparecerá ningún código, y es correcto:** el parser exige que el remitente
sea un dominio de Netflix, justamente para que un correo de phishing no pueda
inyectar un código falso. El `outcome` será `unparsed`.

Para ver qué llegó realmente:

```sql
select received_at, from_address, subject, parse_status
  from inbound_emails
 order by received_at desc
 limit 10;
```

### La prueba definitiva

Cambia el correo de tu cuenta de Netflix a `netflix1@streamclick.xyz` y solicita
un código de verificación. Debe aparecer en el dashboard en menos de dos segundos.

---

## Diagnóstico por síntoma

| Síntoma | Causa probable |
| --- | --- |
| El correo rebota al enviarlo | Falta el catch-all, o Email Routing quedó a medias |
| `wrangler tail` no muestra nada | El catch-all no apunta al Worker |
| El Worker registra **401** | Los secretos no coinciden entre Cloudflare y Vercel |
| El Worker registra **redirección** | El middleware intercepta el webhook (lo cubre `tests/middleware-matcher.test.ts`) |
| `{"status":"ignored"}` | Ninguna cuenta tiene ese `inbox_email` |
| `{"status":"unparsed"}` | Remitente no-Netflix, o el correo no traía código |
| Se guarda pero no aparece solo | Realtime: comprueba la publicación (`pg_publication_tables`) |
| Entro y no veo nada en ninguna pantalla | Falta el claim `role: "authenticated"` en el JWT de Clerk |

---

## Nota sobre Clerk en producción

La instancia actual es de **desarrollo** (`intent-crawdad-1.clerk.accounts.dev`,
claves `pk_test_`/`sk_test_`). No afecta al correo —el webhook no pasa por
Clerk— pero sí al login: las instancias de desarrollo tienen límite de usuarios y
muestran avisos.

Antes de abrir a clientes reales hay que crear una **instancia de producción** en
Clerk con el dominio `streamclick.xyz`, lo que implica:

- Claves nuevas `pk_live_`/`sk_live_` en Vercel.
- Registros DNS de Clerk en Cloudflare (los indica su panel).
- **Actualizar el dominio del Third-Party Auth en Supabase**: el issuer cambia, y
  si no se actualiza, Supabase rechazará todos los tokens nuevos.
