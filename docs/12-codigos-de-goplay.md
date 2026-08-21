# Códigos de Disney+ a través de GoPlay

Las cuentas de Disney+ no las tenemos nosotros: se las compramos a **GoPlay**, y
el buzón de esas cuentas es suyo. El correo de verificación de Disney nunca pasa
por `streamclick.xyz`, así que el pipeline de correo entrante —el que sostiene
Netflix— no puede verlo.

Este documento explica cómo se obtiene el código igualmente.

## 1 · La diferencia de fondo: push contra pull

| | Netflix | Disney+ vía GoPlay |
| --- | --- | --- |
| Quién empieza | El correo llega solo | Alguien tiene que **preguntar** |
| Transporte | Cloudflare Email Worker → webhook | Petición HTTP a la API de GoPlay |
| Cuándo ocurre | Cuando Netflix escribe | Cuando el cliente pulsa un botón |

Todo lo demás **no cambia**: el correo se parsea con el mismo
`DisneyPlusEmailParser`, el PIN entra por el mismo RPC idempotente y se entrega
por Realtime igual que siempre.

> **GoPlay es un transporte nuevo, no un parser nuevo.** Si alguien empieza a
> escribir un `GoPlayParser`, se ha equivocado de capa: lo que devuelve GoPlay es
> el correo de Disney tal cual, y para eso ya hay parser.

El lado bueno de que sea *pull*: el cliente puede pedirse su propio código sin
esperar al operador, algo que con Netflix no es posible.

## 2 · Su API

Base: `https://api.goplay.com.co`. Autenticación: `Authorization: Bearer <token>`.

El panel es **multi-inquilino**: la sesión del navegador vive en el subdominio
del revendedor (`mypantalla.goplay.com.co`), no en `goplay.com.co`. Entrar por el
dominio raíz carga su SPA sin sesión y su Vue se rompe al pintar la tabla. Es un
bug suyo y despista, porque parece un problema de credenciales.

### Listar los perfiles

```
GET /api/v1/profiles?params={"_paginate":{"page":1,"max_rows":10},"_order":null}
```

Devuelve `{total, items[], success}`. De cada fila importan `id` —que es el
`profile_id` que hay que guardar en `streaming_accounts`—, `digital_account`,
`screen_profile` y `check_emails`, que indica si esa cuenta admite la consulta.

### Pedir el código

```
POST /api/v1/profiles-check-emails      body: { profile_id }
```

Es exactamente lo que hace el botón del sobre en su panel.

## 3 · Las tres trampas de su respuesta

### 3.1 Responde 200 aunque falle

Credenciales incorrectas, validación fallida y «todavía no hay código» llegan
**todas como HTTP 200**. El éxito lo decide el campo `success`, nunca el estado.

```jsonc
// sin correo pendiente — es el caso más frecuente, no es un error
{ "success": false, "msg": "No se pudo obtener el código del correo. " }

// con correo
{ "success": true, "msg": "Enviado correctamente.", "response": "…" }
```

Tratar el 200 como éxito hace que los fallos desaparezcan en silencio, que es el
mismo modo de fallo contra el que se diseñaron los códigos de respuesta del
webhook.

### 3.2 `response` es JSON dentro de un string

Hay que hacer `JSON.parse` **dos veces**. Dentro viaja la respuesta cruda de
**Zoho Mail**, que es quien les hospeda el buzón:

```jsonc
{ "result": "success", "message": null, "items": [ { "messageId": "…", "html": "…" } ] }
```

De cada item se usan `messageId` (clave de idempotencia), `receivedTime` (epoch
en milisegundos, como string), `html`, `subject`, `fromAddress` y `toAddress`
—este último **escapado como HTML**: `&lt;alguien@dominio&gt;`.

### 3.3 Los acentos vienen comidos

El correo real dice literalmente:

> Tu **cdigo** de acceso **nico** para Disney+ … que **vencer** en 15 minutos.

No están sustituidos: han desaparecido. Todos los caracteres no ASCII, tildes y
eñes incluidas. Por eso cada patrón en español de `disney-plus.parser.ts` escribe
la vocal como opcional (`c[óo]?digo`, `verificaci[óo]?n`).

**Y hay que parsear `item.html`, no `item.summary`.** En el resumen el código va
incrustado en la frase y ninguna regla contextual lo alcanza —entre la etiqueta y
el número hay un «15» que las reglas ancladas con `[^\d]` no pueden cruzar—;
en el HTML, tras `htmlToText`, el código queda solo en su línea.

Hoy el parser acierta gracias a esa regla de línea aislada. La regla laxa
`codigo-etiquetado-laxo` existe como red por si Disney cambia la maquetación.

## 4 · La autenticación, y su punto débil

GoPlay tiene dos caminos de acceso:

| Camino | Endpoints | ¿Automatizable? |
| --- | --- | --- |
| Contraseña | `POST /api/login` (ojo: **sin** `/v1`) | ✅ Sí |
| Código | `POST /api/user-validate` → `POST /api/user-code-login` | ❌ El código llega a un canal externo |

Tras autenticar, la respuesta trae **`active_g2fa`**. Si está activo hay un paso
más contra `POST /api/v1/validate-g2fa/` con el código de Google Authenticator.

> ⚠️ **El login automático sólo funciona mientras Google Authenticator esté
> desactivado en la cuenta de GoPlay.** El banner de su panel invita a activarlo.
> Si se activa, el servidor deja de poder iniciar sesión: la única salida sería
> guardar la semilla TOTP en nuestro entorno, lo que vacía de sentido al segundo
> factor. La alternativa honesta es pegar un token vigente en `GOPLAY_TOKEN` y
> reponerlo cuando caduque.

El token se cachea **por instancia**, no en un singleton con vocación de
permanencia: en Vercel las funciones son efímeras y cada arranque en frío hará un
login nuevo. Es un coste asumible y evita fingir que conocemos una caducidad que
nadie nos ha dicho.

Cuando el token caduca, la petición devuelve 401 y el cliente **renueva y
reintenta una sola vez**. Un login fallido, en cambio, **no se reintenta**: si el
operador cambia la contraseña, martillear su login es la vía rápida a que nos
bloqueen la cuenta.

## 5 · Configuración

```bash
GOPLAY_BASE_URL=https://api.goplay.com.co
GOPLAY_EMAIL=...        # correo del operador en GoPlay
GOPLAY_PASSWORD=...     # se usa sólo desde el servidor
GOPLAY_TOKEN=           # alternativa si el login automático no es posible
```

Todas opcionales: sin ellas la aplicación arranca igual y lo único que no
funciona es consultar códigos de ese proveedor.

## 6 · Qué falta

- **Confirmar la respuesta de `/api/login`.** No se pudo verificar desde el
  navegador —responde sin cabeceras CORS— así que `extraerToken()` acepta varias
  ubicaciones plausibles del token. En cuanto se compruebe contra el servidor
  real, hay que dejar una sola y anotarlo aquí.
- **El esquema.** `streaming_accounts` necesita `proveedor` y
  `proveedor_perfil_id` para saber a qué cuenta de GoPlay corresponde cada una.
- **La pantalla.** La Server Action de autoservicio, con su límite de frecuencia
  para no martillear a GoPlay cada vez que el cliente pierde la paciencia.
