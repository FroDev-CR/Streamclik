# Cambiar el correo de una cuenta de Netflix a StreamClick

Cómo pasar una cuenta de Netflix existente a un buzón `@streamclick.xyz` para que
sus códigos lleguen a la plataforma.

## ⚠️ El orden importa, y mucho

**Crea primero la cuenta en StreamClick, y sólo después cambia el correo en
Netflix.** Si lo haces al revés:

1. Cambias el correo en Netflix a `netflix1@streamclick.xyz`.
2. Netflix envía el correo de verificación a esa dirección.
3. Llega a Cloudflare → Worker → webhook.
4. El webhook no encuentra ninguna cuenta con ese buzón y responde
   `{"status":"ignored"}`.
5. **El correo se descarta y no puedes confirmar el cambio.**

Netflix permite reenviarlo, pero mientras la cuenta no exista en StreamClick el
resultado será siempre el mismo.

## Antes de empezar: la red de seguridad

Netflix confirma el cambio de correo con un **enlace**, no con un código
numérico. El parser está hecho para extraer códigos, así que ese correo se
guardará como *«Sin código»* — que es lo correcto, no hay ningún número que
extraer.

Tienes dos formas de llegar a ese enlace:

**Opción A — el reenvío del Worker (recomendada).** Descomenta `FORWARD_TO` en
`workers/inbound-email/wrangler.toml` con tu correo personal, ya verificado en
Cloudflare, y vuelve a desplegar:

```toml
FORWARD_TO = "tu-correo-personal@gmail.com"
```

Así recibes una copia íntegra de cada correo y puedes pulsar el enlace
directamente.

**Opción B — Cloudflare Email Routing.** Añade temporalmente una regla concreta
para `netflix1@streamclick.xyz` que reenvíe a tu correo personal en lugar de ir
al Worker. Al terminar, la borras y vuelve a mandar el catch-all.

> Sin una de las dos, verás en *Correos recibidos* que el correo llegó, pero no
> podrás abrir el enlace que contiene.

## Procedimiento

### 1. Crear la cuenta en StreamClick

`https://streamclick.xyz/admin` → **Añadir cuenta**

| Campo | Valor |
| --- | --- |
| Servicio | Netflix |
| Nombre interno | `Netflix 01` |
| **Correo de ingesta** | `netflix1@streamclick.xyz` |
| Correo de acceso | El correo **actual** de la cuenta de Netflix |
| Contraseña | La contraseña actual |
| Perfiles | 5 |

El correo de acceso lo actualizarás en el paso 4, cuando el cambio esté
confirmado.

### 2. Comprobar que el buzón responde

```bash
export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
npm run diagnostico:correo
```

El paso 6 debe decir **`created`**. Si dice `ignored`, el correo de ingesta que
escribiste no coincide con el que el diagnóstico está probando: revísalo antes de
seguir, porque es exactamente el fallo que hace que Netflix no pueda verificarte.

### 3. Cambiar el correo en Netflix

En [netflix.com/account](https://www.netflix.com/account):

1. **Información de la cuenta → Correo electrónico → Cambiar correo**
2. Netflix pedirá tu contraseña actual.
3. Introduce la dirección nueva: `netflix1@streamclick.xyz`
4. Netflix envía un correo de verificación **a la dirección nueva**.
5. Ábrelo por la vía que preparaste (reenvío del Worker o regla temporal) y pulsa
   el enlace de confirmación.

En el panel, ese correo aparecerá en **Correos recibidos** marcado como *«Sin
código»*. Es la confirmación de que la cadena funciona de extremo a extremo,
aunque no haya ningún número que mostrar.

### 4. Actualizar la ficha en StreamClick

Vuelve al banco de cuentas y actualiza el **correo de acceso** al nuevo
(`netflix1@streamclick.xyz`), que es el que tus clientes usarán para iniciar
sesión en Netflix.

> Mientras no exista un formulario de edición, la forma de cambiarlo es eliminar
> la cuenta y volver a crearla. Ten en cuenta que eso borra el historial de
> códigos y las asignaciones: es más cómodo hacerlo antes de repartir perfiles.

### 5. Probar de verdad

En Netflix, solicita un código de verificación de hogar (o inicia sesión desde un
dispositivo nuevo). El código debe aparecer en el dashboard **en menos de dos
segundos, sin recargar**.

## Después: los códigos ya no llegan a tu correo personal

Una vez cambiado, **todos** los correos de esa cuenta de Netflix van a
`netflix1@streamclick.xyz`: códigos, facturas, avisos de seguridad y
restablecimientos de contraseña.

Dos consecuencias que conviene tener presentes:

- **Recuperar la contraseña de esa cuenta de Netflix** pasa por ese buzón. Si
  StreamClick estuviera caído, no podrías. Mantener `FORWARD_TO` activo de forma
  permanente es una buena póliza de seguro.
- **Guarda la contraseña en un gestor**, no confíes sólo en «recuperarla por
  correo».

## Si algo no sale

| Síntoma | Causa |
| --- | --- |
| Netflix dice que no recibió confirmación | Aún no habías creado la cuenta en StreamClick: el correo se descartó |
| El correo no aparece en *Correos recibidos* | El catch-all no apunta al Worker. Compruébalo con `npx wrangler tail` |
| Aparece como *«Buzón desconocido»* | El correo de ingesta de la ficha no coincide con la dirección real |
| Llega pero no puedes abrir el enlace | Falta configurar `FORWARD_TO` en el Worker |
| El código no aparece en el dashboard | Falta asignarte un perfil de esa cuenta: los PIN se ven por asignación |
