# Flujo completo: del correo entrante al PIN en pantalla

Es el corazón del producto. Objetivo de latencia: **menos de 2 segundos** desde
que el proveedor entrega el webhook hasta que el número aparece en la pantalla del
cliente, sin que este refresque nada.

## 1. Vista general

```
   Netflix
      │  envía código a netflix1@streamclick.com
      ▼
┌───────────────────────────────────────────────────────────┐
│ Proveedor de inbound email                                │
│ (Resend Inbound · Cloudflare Email Workers · Postmark)    │
└──────────────────────────┬────────────────────────────────┘
                           │ HTTPS POST (firmado)
                           ▼
┌───────────────────────────────────────────────────────────┐
│ POST /api/webhooks/inbound-email      (runtime = nodejs)  │
│  1. Verificar firma HMAC  → 401 si no coincide            │
│  2. Rate limit por IP     → 429                           │
│  3. Normalizar payload del proveedor a InboundEmailDTO    │
└──────────────────────────┬────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────┐
│ ProcessInboundEmailUseCase        (src/core/use-cases)    │
│  4. Resolver cuenta por inbox_email normalizado           │
│  5. Seleccionar parser del registry según el servicio     │
│  6. Extraer código, tipo y enlace de acción (regex)       │
│  7. Persistir de forma atómica vía RPC                    │
│  8. Encolar notificaciones en el outbox                   │
└──────────────────────────┬────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────┐
│ RPC ingest_inbound_email()  — una sola transacción        │
│   INSERT inbound_emails  ON CONFLICT (message_id) → salir │
│   INSERT verification_pins                                │
│   INSERT notification_outbox (una fila por asignado)      │
└──────────────────────────┬────────────────────────────────┘
                           │ WAL
                           ▼
┌───────────────────────────────────────────────────────────┐
│ Supabase Realtime — evalúa RLS por suscriptor             │
└──────────────────────────┬────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────┐
│ <LivePinCard/>  ("use client")                            │
│   useLatestPin() actualiza el estado → el PIN aparece     │
└───────────────────────────────────────────────────────────┘
```

## 2. Paso a paso

### Paso 1 — Verificación de firma

El endpoint es público por necesidad: el proveedor tiene que poder llamarlo. Sin
verificación, cualquiera podría inyectar PIN falsos con un `curl`.

Se calcula HMAC-SHA256 sobre el **cuerpo crudo** (no sobre el JSON re-serializado
— `JSON.stringify` no garantiza el mismo orden de claves ni el mismo espaciado, y
la firma no cuadraría) y se compara con `timingSafeEqual`. La comparación con
`===` filtra información por tiempo de ejecución y permite reconstruir la firma
byte a byte.

Se rechaza además cualquier timestamp con más de 5 minutos de desfase, para que un
webhook capturado no pueda reproducirse indefinidamente (replay attack).

### Paso 2 — Rate limiting

Limitador de ventana fija en memoria como red de contención básica. En Vercel las
funciones son efímeras y el estado no se comparte entre instancias, así que se
documenta como mitigación parcial: la protección real en producción es Upstash
Redis o Vercel Firewall. Se prefiere admitirlo aquí antes que dar una falsa
sensación de seguridad.

### Paso 3 — Normalización del proveedor

Cada proveedor tiene su propio formato. Un adaptador por proveedor traduce a un
DTO interno:

```ts
type InboundEmailDTO = {
  messageId: string;   // idempotencia
  to: string;          // netflix1@streamclick.com
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: Date;
};
```

Cambiar de Resend a Postmark = escribir un adaptador nuevo. El caso de uso no se
entera. Es DIP aplicado donde de verdad rinde: los proveedores de correo se
cambian con frecuencia por precio y por límites de entrega.

### Paso 4 — Resolución de la cuenta

La dirección se normaliza antes de buscar: minúsculas, `trim`, y se descartan las
sub-direcciones (`netflix1+abc@…` → `netflix1@…`). Sin esto, `Netflix1@…` no
encontraría la cuenta y el PIN se perdería en silencio.

Si no hay cuenta, se responde **200** con `{ status: "ignored" }`, no 404. Un 4xx
haría que el proveedor reintentara indefinidamente correo que nunca va a casar
(spam a un buzón inexistente). Se acusa recibo y se descarta.

### Paso 5 y 6 — Parsing

`ParserRegistry` selecciona la estrategia por el slug del servicio. `NetflixEmailParser`:

1. Convierte HTML a texto plano (los correos de Netflix traen el código dentro de
   una tabla anidada; la versión `text/plain` no siempre existe).
2. Clasifica el tipo de correo por asunto y cuerpo, en español e inglés:
   `household`, `login`, `signup`, `password_reset`.
3. Aplica patrones en orden de especificidad. Primero los anclados a contexto
   ("código de acceso temporal: 1234"), después el patrón genérico de 4–6 dígitos.

El orden importa: los correos de Netflix contienen otros números (año del
copyright, importes, IDs). Un `\d{4,6}` suelto extrae "2026" del pie de página
con alegría. Por eso la extracción anclada por contexto va primero y el patrón
genérico solo actúa como último recurso, excluyendo años y secuencias con
separadores de miles.

4. Extrae la `action_url` ("Sí, fui yo") cuando existe.

**Los parsers son funciones puras.** Entra un string, sale un `ParsedPin | null`.
Sin I/O, sin fechas del sistema, sin aleatoriedad. Por eso los tests son
instantáneos y por eso cada correo real que falla se convierte en un test de
regresión de tres líneas.

Si el parsing falla, el correo se guarda con `parse_status='failed'` y el cuerpo
íntegro. Es material de diagnóstico, no un error perdido en un log.

### Paso 7 — Persistencia atómica

Un único RPC `ingest_inbound_email(...)` en PL/pgSQL hace las tres inserciones en
una transacción. Alternativa descartada: tres llamadas desde el cliente JS, que
no comparten transacción — un fallo intermedio dejaría el correo registrado sin
PIN, o el PIN sin outbox.

La idempotencia es lo primero que ocurre:

```sql
INSERT INTO inbound_emails (...) VALUES (...)
ON CONFLICT (message_id) DO NOTHING
RETURNING id INTO v_email_id;

IF v_email_id IS NULL THEN
  RETURN jsonb_build_object('status', 'duplicate');
END IF;
```

Se apoya en una restricción UNIQUE, no en un `SELECT` previo. Dos entregas
simultáneas del mismo webhook pasarían ambas un `SELECT ... IF NOT EXISTS`; solo
una gana el índice único.

### Paso 8 — Notificaciones (outbox)

Se inserta una fila en `notification_outbox` por cada usuario con asignación
activa, en la misma transacción. El webhook responde de inmediato. La entrega real
la hace un worker aparte (aún no implementado: hoy hay un canal `noop` que
registra en el log).

Trade-off consciente: el PIN llega por Realtime en milisegundos; WhatsApp llegará
en segundos. Para este producto es correcto — el canal principal es la web y los
demás son respaldo para cuando el cliente no la tiene abierta.

### Paso 9 — Entrega en tiempo real

```ts
supabase
  .channel(`pins:${accountId}`)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'verification_pins',
        filter: `account_id=eq.${accountId}` },
      ({ new: pin }) => setLatestPin(pin))
  .subscribe();
```

Tres garantías apiladas:

1. **RLS** — Realtime evalúa la política por suscriptor. Un cliente sin asignación
   activa no recibe el evento aunque se suscriba al canal a mano.
2. **Filtro por `account_id`** — evita re-renders por cuentas ajenas del mismo
   usuario. Rendimiento, no seguridad.
3. **Fetch inicial en el servidor** — el Server Component entrega el último PIN ya
   renderizado en el HTML. Realtime solo aporta las **actualizaciones**. Sin esto,
   la primera pintura mostraría "sin PIN" durante el handshake del WebSocket.

### Paso 10 — Reconexión

`useLatestPin` vuelve a consultar el último PIN cuando la conexión se restablece
y cuando la pestaña recupera el foco. Un WebSocket caído durante 30 segundos se
pierde los eventos de ese intervalo; sin re-fetch, la UI mostraría un PIN viejo
con total confianza. El caso realista es el móvil que se bloquea y se desbloquea
justo cuando llega el código.

## 3. Modos de fallo y respuesta

| Fallo | Comportamiento |
| --- | --- |
| Firma inválida | 401, nada se persiste |
| Correo duplicado | 200 `{status:"duplicate"}`, sin efectos |
| Cuenta desconocida | 200 `{status:"ignored"}` |
| Parser sin coincidencia | 200 `{status:"unparsed"}`, correo guardado para diagnóstico |
| Postgres caído | 500 → el proveedor reintenta; la idempotencia lo hace seguro |
| WebSocket caído | Re-fetch al reconectar y al recuperar el foco |
| PIN expirado | La UI lo marca como vencido a los 15 min, no lo oculta |

## 4. Prueba local sin proveedor de correo

```bash
curl -X POST http://localhost:3000/api/webhooks/inbound-email \
  -H "Content-Type: application/json" \
  -H "x-streamclick-signature: <hmac_sha256_del_cuerpo>" \
  -d @tests/fixtures/netflix-household.json
```

El script `scripts/sign-payload.mjs` calcula la firma a partir de
`INBOUND_EMAIL_WEBHOOK_SECRET`.
