# Email Worker — ingesta de correo

Recibe todo el correo dirigido a `*@streamclick.xyz`, lo convierte a JSON, lo
firma con HMAC y lo envía al webhook de StreamClick.

Este Worker es un proyecto npm **independiente** del de la aplicación: se
despliega en Cloudflare, no en Vercel, y tiene su propio `package.json`. No
ejecutes `npm install` aquí desde la raíz del repositorio.

## Qué hace y qué no

**Sí:** parsea el MIME, extrae asunto/texto/HTML, resuelve el `Message-ID` para
la idempotencia, firma y entrega.

**No:** extraer el código. Esa lógica vive en la aplicación
(`src/infrastructure/email/parsers/`), donde está testeada y donde se corrige sin
tener que desplegar dos sistemas. El Worker es un traductor, no un parser.

## Despliegue

> **¿Sin acceso a una terminal?** Hay un workflow de GitHub Actions que hace esto
> mismo desde el navegador, también en el móvil:
> [`docs/09-desplegar-sin-terminal.md`](../../docs/09-desplegar-sin-terminal.md).


```bash
cd workers/inbound-email
npm install

# Autenticarse en Cloudflare (abre el navegador)
npx wrangler login

# El secreto compartido con la aplicación.
# Debe ser EXACTAMENTE el mismo valor que INBOUND_EMAIL_WEBHOOK_SECRET en Vercel.
npx wrangler secret put INBOUND_EMAIL_WEBHOOK_SECRET

npx wrangler deploy
```

Después, en el panel de Cloudflare:

**Email → Email Routing → Routes → Catch-all address**
→ Action: *Send to a Worker* → `streamclick-inbound-email` → Save

## Verificación

```bash
npx wrangler tail
```

Envía un correo cualquiera a `netflix1@streamclick.xyz` desde tu correo personal
y observa la salida. Deberías ver una línea con `"message":"Correo entregado al
webhook"`. El `outcome` dirá:

| `outcome` | Significado |
| --- | --- |
| `{"status":"created"}` | Código extraído y guardado. Todo funciona. |
| `{"status":"ignored"}` | No existe ninguna cuenta con esa dirección de ingesta. Créala en `/admin`. |
| `{"status":"unparsed"}` | Llegó y se guardó, pero no contenía código. Normal en un correo de prueba. |
| `{"status":"duplicate"}` | Reintento del mismo mensaje. La idempotencia funcionando. |

Si ves `El webhook rechazó el correo` con estado **401**, el secreto no coincide
entre Cloudflare y Vercel. Es el fallo más común de esta integración.

## Variables

| Nombre | Dónde se define | Obligatoria |
| --- | --- | --- |
| `WEBHOOK_URL` | `wrangler.toml` | Sí |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | `wrangler secret put` | Sí |
| `FORWARD_TO` | `wrangler.toml` | No, pero recomendable |

`FORWARD_TO` es la red de seguridad: si la aplicación está caída, el correo se
reenvía a un buzón real y el código puede leerse a mano en lugar de perderse.
