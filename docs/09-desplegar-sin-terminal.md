# Desplegar sin terminal (desde el móvil)

La aplicación la despliega Vercel sola en cada push. El **Email Worker** vive en
Cloudflare y hasta ahora exigía `npx wrangler deploy` desde un ordenador.

Con el workflow `.github/workflows/desplegar-worker.yml` puedes lanzarlo desde el
navegador del teléfono. La configuración inicial son cinco minutos y sólo se hace
una vez.

## Configuración inicial (una sola vez)

### 1. Token de Cloudflare

En [dash.cloudflare.com](https://dash.cloudflare.com):

1. Toca tu avatar (arriba a la derecha) → **My Profile**
2. **API Tokens** → **Create Token**
3. Busca la plantilla **«Edit Cloudflare Workers»** → **Use template**
4. Baja del todo → **Continue to summary** → **Create Token**
5. **Copia el token ahora.** Cloudflare no vuelve a mostrarlo.

### 2. Account ID de Cloudflare

En el panel de Cloudflare, entra en `streamclick.xyz`. En la barra lateral
derecha (o al final de la página en móvil) aparece **Account ID**. Cópialo.

> También está en la URL: `dash.cloudflare.com/<ESTO-ES-EL-ACCOUNT-ID>/...`

### 3. El secreto compartido — **opcional**

Los secretos de un Worker de Cloudflare **persisten entre despliegues**. Si el
Worker ya se publicó alguna vez con `wrangler secret put`, el valor sigue ahí y
el workflow lo conserva: no hace falta configurar nada.

Sólo tiene sentido añadirlo a GitHub si quieres que el despliegue mantenga
sincronizados Cloudflare y Vercel de forma automática, o si nunca llegaste a
configurarlo. Para verlo desde el móvil:

[vercel.com](https://vercel.com) → proyecto `streamclik` → **Settings** →
**Environment Variables** → busca `INBOUND_EMAIL_WEBHOOK_SECRET` → icono del ojo
para revelarlo.

> Si lo añades, tiene que ser **exactamente el mismo** que en Vercel. Con
> secretos distintos el webhook responde 401 a todo y ningún código llega jamás:
> es el fallo más común de esta integración.

### 4. Guardar en GitHub

En [github.com/FroDev-CR/Streamclik](https://github.com/FroDev-CR/Streamclik):

**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Nombre | ¿Obligatorio? | Valor |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Sí | El token del paso 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Sí | El Account ID del paso 2 |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | No | El secreto del paso 3 |

> En el móvil conviene usar el navegador en **modo escritorio**: la app de GitHub
> no permite gestionar secretos ni lanzar workflows.

⚠️ **Pega los tokens directamente en el campo de GitHub.** No pasan por un chat,
ni por notas, ni por un correo: un token filtrado da acceso de edición a tus
Workers. Si alguno se expone, revócalo en Cloudflare y crea otro — cuesta treinta
segundos.

## Desplegar

A partir de ahora, cada vez que quieras publicar el Worker:

1. Ve a la pestaña **Actions** del repositorio
2. En la lista de la izquierda, **«Desplegar Email Worker»**
3. Botón **«Run workflow»** → elige la rama → **Run workflow**
4. En un minuto aparece en verde

También se lanza **solo** cuando un push cambia algo dentro de
`workers/inbound-email/`, así que normalmente no tendrás que hacer nada.

## Comprobar que funcionó

No hace falta terminal. En **Correos recibidos** del panel, mira el remitente del
próximo correo de Netflix que llegue:

| Antes | Después |
| --- | --- |
| `010f019fbdcf0972-cd1dd5…` | `info@account.netflix.com` |

El primero es el *remitente de sobre* de Amazon SES; el segundo es la cabecera
`From` real. Si sigues viendo el identificador largo, el despliegue no se aplicó.

Esa diferencia importa: el parser exige que el remitente sea un dominio de
Netflix —para que un correo de phishing no pueda inyectar un código falso—, así
que con el remitente de sobre rechazaría **todos** los correos legítimos y
ninguno llegaría a mostrar su código.

## Lo que este workflow NO hace

**No configura el enrutamiento del correo.** El catch-all vive en el panel de
Cloudflare y se queda como esté:

**Email → Email Routing → Routes → Catch-all address** → *Send to a Worker* →
`streamclick-inbound-email`

Sólo hay que tocarlo si lo cambias a mano.
