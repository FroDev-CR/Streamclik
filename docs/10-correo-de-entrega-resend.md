# Correo automático de entrega con Resend

StreamClick envía los datos de la compra después de que `soltar_cuenta()` haya
creado todas las asignaciones. El mensaje incluye únicamente los perfiles del
pedido aprobado: plataforma, correo, contraseña, nombre de perfil, PIN y
vigencia.

## 1. DNS en Cloudflare

En **Resend → Domains → streamclick.xyz**, usa **Auto configure** o copia los
registros mostrados por Resend a **Cloudflare → streamclick.xyz → DNS**:

| Tipo | Nombre en Cloudflare | Contenido                                                                     |
| ---- | -------------------- | ----------------------------------------------------------------------------- |
| TXT  | `resend._domainkey`  | La clave DKIM completa mostrada por Resend                                    |
| MX   | `send`               | El servidor `feedback-smtp...amazonses.com` mostrado por Resend; prioridad 10 |
| TXT  | `send`               | El SPF mostrado por Resend, normalmente `v=spf1 include:amazonses.com ~all`   |
| TXT  | `_dmarc`             | Opcional. Si ya existe uno, no crees un segundo registro.                     |

Pulsa **Verify DNS Records** en Resend. El dominio debe quedar con estado
**Verified**.

No actives **Enable Receiving** en Resend: los correos entrantes con códigos ya
los recibe Cloudflare Email Routing. El MX de envío de Resend vive en
`send.streamclick.xyz` y no sustituye los MX del dominio principal.

## 2. Crear la clave de Resend

1. Abre **Resend → API Keys → Create API Key**.
2. Nombre: `StreamClick Production`.
3. Permiso: **Sending access**.
4. Restringe la clave a `streamclick.xyz` si el formulario lo permite.
5. Copia el valor `re_...` una sola vez. No lo pegues en chats ni lo guardes en
   GitHub.

## 3. Variables en Vercel

En **Vercel → streamclik → Settings → Environment Variables** agrega:

```text
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=cuentas@streamclick.xyz
```

Marca **Production** y **Preview**, guarda y ejecuta **Redeploy** sobre el último
deployment. La dirección `cuentas@streamclick.xyz` no necesita crearse como
sender dentro de Resend una vez verificado el dominio.

Para desarrollo local, agrega las mismas variables a `.env.local` y reinicia
`npm run dev`.

## 4. Prueba completa

1. Crea una compra de prueba con un correo tuyo.
2. Sube el comprobante.
3. En **Admin → Pagos**, pulsa **Soltar compra**.
4. Debe aparecer: `Compra entregada y datos enviados a ...`.
5. Revisa **Resend → Emails** y después bandeja principal/spam del destinatario.

Si Resend falla, la compra no se revierte. El panel indica que el correo quedó
pendiente y permite volver a pulsar **Soltar compra**. Resend recibe una clave de
idempotencia basada en el pedido para evitar duplicados durante reintentos.
