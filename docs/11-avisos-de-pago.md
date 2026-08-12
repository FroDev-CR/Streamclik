# Avisos de pago

Cuando un cliente sube su comprobante queda bloqueado esperando a que una
persona lo mire. Este documento explica cómo se entera el operador.

## 1 · Qué está montado

Notificaciones **Web Push** al teléfono del operador, usando la aplicación que
ya es instalable (`docs` de la PWA). No hay servidor extra ni terceros de por
medio: el aviso lo entrega el propio servicio de push del navegador (Google en
Android, Apple en iOS, Mozilla en Firefox).

```
El cliente sube el comprobante
   ↓
El pedido pasa a `esperando_revision`
   ↓
avisarDePagoPendiente()  ← en features/orders/actions.ts
   ↓
notificarAdminsDePago()  ← lee las suscripciones de los admins
   ↓
sendPush() por cada dispositivo  (VAPID + cifrado aes128gcm)
   ↓
El service worker muestra la notificación
   ↓
Al tocarla se abre /admin/pagos
```

Se dispara en los **tres** caminos por los que un pago llega a revisión: compra
directa, compra de carrito y reenvío de un comprobante corregido.

## 2 · Puesta en marcha

```bash
npm run claves:push
```

Imprime tres variables. Van a `.env.local` y a Vercel (*Production* y
*Preview*):

| Variable | Dónde vive |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Servidor y navegador. Es pública por diseño. |
| `VAPID_PRIVATE_KEY` | **Sólo servidor.** No sale de las variables de entorno. |
| `VAPID_SUBJECT` | Un `mailto:` de contacto. Lo exige el RFC 8292. |

**Las claves se generan una vez y no se rotan a la ligera.** Al cambiarlas,
todas las suscripciones existentes dejan de valer y hay que volver a dar permiso
en cada dispositivo.

Después: entrar en **Pagos** desde el móvil y pulsar *Activar avisos*. El
permiso lo concede cada navegador por separado, así que hay que repetirlo en
cada aparato donde se quiera recibir el aviso.

### En iPhone hay un paso más

Safari sólo permite notificaciones si la aplicación está **instalada en la
pantalla de inicio**: Compartir → Añadir a inicio. Desde la pestaña normal la API
ni siquiera existe, y la pantalla lo explica en vez de ofrecer un botón que no
haría nada.

## 3 · Decisiones que conviene no deshacer

### El cifrado se implementa sin dependencia

`src/lib/web-push.ts` hace VAPID y el cifrado `aes128gcm` con `node:crypto`, en
lugar de instalar `web-push`. Son cien líneas de estándar bien especificado, y
`tests/web-push.test.ts` las comprueba **contra los vectores del apéndice A del
RFC 8291**, byte a byte.

Esa prueba no es decorativa. Si una derivación estuviera mal, el código seguiría
produciendo un buffer de aspecto razonable y sería el navegador quien lo
descartaría, en silencio. El síntoma —«no llegan las notificaciones»— no apunta
en absoluto a su causa.

Detalle que cuesta un rato encontrar: la firma del JWT tiene que ir en formato
`ieee-p1363` (los dos enteros crudos). Con el DER que Node devuelve por defecto,
el servicio de push responde **401 sin explicar por qué**.

### El envío usa el cliente administrativo

`notificarAdminsDePago()` lee con `createSupabaseAdminClient()`, que omite RLS, y
es correcto: quien dispara el aviso es el cliente que acaba de pagar, y sus
políticas le impiden —por diseño— leer las suscripciones del operador. No es RLS
sorteado por comodidad; es una operación del sistema, no del usuario que la
desencadena.

### Un fallo del aviso nunca tumba una compra

El pedido ya está guardado cuando se llama al aviso. `sendPush()` no lanza nunca
y `avisarDePagoPendiente()` traga cualquier error con un `logger.warn`: el
cliente no tiene nada que arreglar si la notificación no sale.

### Las suscripciones muertas se borran solas

Un 404 o un 410 del servicio de push significan que ese navegador desinstaló la
aplicación o revocó el permiso. La fila se elimina en el momento; si no, cada
pago reintentaría contra un dispositivo que ya no existe y el log se llenaría de
fallos que no lo son.

### El service worker no cachea nada nuevo

Los manejadores `push` y `notificationclick` no tocan la caché. La regla de
`sw.js` sigue en pie: **nunca** se guardan respuestas de navegación, porque
servirían el panel de un usuario al siguiente que abriera la aplicación en el
mismo teléfono, saltándose Clerk y RLS.

`showNotification` se llama **siempre** que llega un push, incluso si la carga
viene malformada. Los navegadores lo exigen: un push que no muestra nada acaba
con el permiso revocado.

## 4 · Lo que todavía no hace

- **No avisa de las solicitudes de cambio de PIN**, sólo de los pagos. Añadirlo
  es llamar a `notificarAdminsDePago()` desde `solicitarCambioPinAction`.
- **No hay reintentos.** Si el envío falla, se pierde. La tabla
  `notification_outbox` existe para eso y sería el siguiente paso si hiciera
  falta.

## 5 · WhatsApp: evaluado y descartado

**No hay que implementarlo.** Se estudió montar el aviso por WhatsApp con
Baileys y se decidió que la notificación de la aplicación lo cubre mejor. Queda
escrito aquí para que nadie lo «complete» más adelante creyendo que era un hueco
pendiente.

Los motivos, por orden de peso:

1. **Baileys no puede vivir en Vercel.** Mantiene un WebSocket abierto contra
   WhatsApp y guarda en disco la sesión del emparejamiento por QR; las funciones
   de Vercel son efímeras y su disco es de sólo lectura. Exige un proceso aparte
   encendido las veinticuatro horas.
2. **Si ese proceso vive en una máquina doméstica, Vercel no puede llamarlo**
   —está detrás del router, sin IP pública—, así que habría que invertir el
   diseño y hacer que consulte él a Supabase. Más piezas para el mismo resultado.
3. **Baileys no es oficial.** WhatsApp puede cerrar el número que se use, y ese
   número es el del negocio.
4. **La notificación push ya llega igual de rápido** al mismo teléfono, sin
   depender de nadie más y sin nada que mantener encendido.

Si algún día hiciera falta WhatsApp **hacia los clientes** (no hacia el
operador), lo que corresponde evaluar es la Cloud API oficial de Meta, con sus
plantillas aprobadas y su coste por conversación. Está descrito en
[`05-integraciones-futuras.md`](05-integraciones-futuras.md), y es un problema
distinto a éste.
