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

- **No avisa por WhatsApp.** Está pendiente montar el proceso de Baileys
  (§5), que necesita un servidor encendido las 24 horas.
- **No avisa de las solicitudes de cambio de PIN**, sólo de los pagos. Añadirlo
  es llamar a `notificarAdminsDePago()` desde `solicitarCambioPinAction`.
- **No hay reintentos.** Si el envío falla, se pierde. La tabla
  `notification_outbox` existe para eso y sería el siguiente paso si hiciera
  falta.

## 5 · WhatsApp con Baileys (pendiente)

Baileys mantiene un WebSocket abierto contra WhatsApp y guarda en disco la
sesión del emparejamiento por QR. **No puede vivir en Vercel**: las funciones son
efímeras y el disco es de sólo lectura. Necesita un proceso aparte, encendido de
forma permanente.

Si ese proceso corre en una máquina doméstica, Vercel **no podrá llamarlo**: está
detrás del router, sin IP pública. Así que el diseño correcto es el inverso —que
el proceso **pregunte** a Supabase si hay pagos pendientes, en vez de esperar a
que le avisen. Es lo que ya recomienda `HANDOFF.md` §8.2 para el outbox:

```sql
select ... from notification_outbox
 where status = 'pending' and next_attempt_at <= now()
 for update skip locked;
```

Eso funciona sin abrir puertos y sobrevive a que se caiga la conexión: al volver,
el proceso recoge lo que quedó pendiente.
