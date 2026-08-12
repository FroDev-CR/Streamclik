# Integraciones futuras: WhatsApp, Telegram y push

El MVP entrega los PIN por la web en tiempo real. Los canales adicionales están
**preparados pero no implementados**, y esa preparación consiste en tres piezas
concretas que ya existen en el código.

## 1. Las tres piezas ya presentes

### Puerto `NotificationSender`

```ts
// src/core/ports/notification-sender.ts
export interface NotificationSender {
  readonly channel: NotificationChannel;   // 'whatsapp' | 'telegram' | 'push' | 'noop'
  send(message: NotificationMessage): Promise<Result<void, NotificationError>>;
}
```

Añadir WhatsApp es implementar esta interfaz y registrarla en el dispatcher. Ni el
caso de uso de ingesta ni el pipeline de correo se modifican. Es OCP en el punto
donde se sabe que va a haber cambio.

### Tabla `notification_outbox`

La ingesta inserta las notificaciones pendientes **en la misma transacción** que el
PIN. El webhook no llama a ninguna API externa.

Sin outbox, un fallo de la API de WhatsApp dejaría al proveedor de correo
esperando, agotando su timeout y reintentando el correo completo. Con outbox, el
webhook responde en milisegundos y la entrega se reintenta de forma independiente
con backoff exponencial.

### Preferencias por usuario

`user_profiles.notification_preferences jsonb` y `telegram_chat_id` ya existen. El
dispatcher consulta las preferencias antes de encolar, para no enviar por canales
que el usuario desactivó.

## 2. Qué falta para activar cada canal

### WhatsApp (Cloud API de Meta)

> **Ojo al alcance.** Esto es WhatsApp **hacia los clientes**, para entregarles
> sus PIN. El aviso *al operador* cuando entra un pago ya está resuelto con
> notificaciones de la aplicación, y la vía de WhatsApp para eso se evaluó y se
> descartó: ver [`11-avisos-de-pago.md`](11-avisos-de-pago.md) §5. No hay que
> montar Baileys.

1. Implementar `WhatsAppSender` con la Cloud API.
2. Registrar una **plantilla de mensaje** aprobada por Meta. Es el punto que suele
   sorprender: fuera de la ventana de 24 horas de conversación no se puede enviar
   texto libre, y un PIN llega cuando llega. La plantilla es obligatoria.
3. Guardar y verificar el teléfono del usuario (`user_profiles.phone` ya existe).

Riesgo a evaluar antes de invertir: Meta cobra por conversación iniciada por la
empresa y aplica límites por número. Con muchos PIN diarios el coste no es
despreciable.

### Telegram (Bot API)

El más simple y el más barato: sin plantillas, sin coste por mensaje.

1. Crear el bot con BotFather.
2. Flujo de vinculación: el usuario abre `t.me/StreamClickBot?start=<token>`, el
   webhook del bot recibe el `chat_id` y lo guarda en `telegram_chat_id`.
3. Implementar `TelegramSender` sobre `sendMessage`.

Recomendación: **empezar por Telegram**. Valida el patrón outbox completo sin
proceso de aprobación ni coste por mensaje.

### Push web (Web Push / VAPID)

1. Service worker y suscripción con `PushManager`.
2. Tabla `push_subscriptions` (endpoint, claves p256dh/auth por dispositivo).
3. `WebPushSender` con la librería `web-push`.

Caso de uso propio: el usuario tiene StreamClick abierto en el móvil pero con la
pantalla bloqueada. Realtime no le sirve; push sí.

## 3. El worker que falta

Hoy nadie consume el outbox. Opciones, en orden de recomendación:

| Opción | Latencia | Nota |
| --- | --- | --- |
| **Supabase Edge Function + `pg_cron`** | ~30 s | Todo dentro de Supabase, sin infra extra. |
| Vercel Cron | ~60 s | Mínimo un minuto de granularidad en el plan base. |
| `pg_net` disparado por trigger | ~1 s | El más rápido, pero acopla la BD a HTTP saliente. |

El diseño del outbox es agnóstico al ejecutor: `SELECT ... FOR UPDATE SKIP LOCKED`
sobre las filas `pending` con `next_attempt_at <= now()`. `SKIP LOCKED` permite
varios workers en paralelo sin entregar dos veces la misma notificación.

## 4. Otros servicios de streaming

Añadir Disney+ o Prime Video:

1. `INSERT` en `streaming_services` con su slug y dominios remitentes.
2. Nuevo parser en `src/infrastructure/email/parsers/` implementando `EmailParser`.
3. Registrarlo en `ParserRegistry`.
4. Tests con correos reales como fixtures.

Cero cambios en el webhook, en el caso de uso o en la UI. Ese es exactamente el
retorno de haber hecho el pipeline genérico desde el principio en vez de escribir
"NetflixWebhook".
