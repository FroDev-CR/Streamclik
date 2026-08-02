# 10 · Flujo de compra: del SINPE a la cuenta soltada

Cómo un visitante pasa de ver el catálogo a tener un perfil activo, y qué hace
el operador en medio.

---

## 1 · El recorrido completo

```
Catálogo (portada o /catalogo)
        │  «Lo quiero»
        ▼
/comprar/[slug]                     ← exige sesión (Clerk) y WhatsApp
        │  paga por SINPE desde su banco
        │  sube la captura
        ▼
orders.status = 'esperando_revision'
        │
        ├──► el cliente lo ve en /historial: «Esperando · Comprobando pago»
        │
        └──► el operador lo ve en /admin/pagos, con el número en la navegación
                    │  mira el comprobante
                    │  pulsa «Soltar cuenta»
                    ▼
             soltar_cuenta(order_id)
                    │  elige el primer perfil libre de esa plataforma
                    │  crea la asignación
                    │  marca el pedido como entregado
                    ▼
             el cliente lo ve en /dashboard con sus credenciales y su PIN
```

## 2 · Por qué SINPE y no una pasarela

En Costa Rica SINPE Móvil es lo que la gente usa. No cobra comisión, no exige
alta de comercio ni verificación de negocio, y no obliga al cliente a meter una
tarjeta en una web que acaba de conocer.

El coste es una revisión humana por venta. A este volumen es asumible, y además
sirve para validar que la gente compra antes de dedicar tiempo a integrar una
pasarela.

Cuando llegue esa integración, la mitad cara ya está construida: la parte de
«pedido confirmado → asignar perfil» (`soltar_cuenta`) no cambia. Sólo cambia
quién confirma: hoy el operador pulsando un botón, mañana un webhook.

## 3 · Por qué un solo botón

El operador pidió expresamente que soltar una cuenta no exigiera elegir nada.
Tenía razón: escoger a mano qué perfil concreto se entrega no aporta ninguna
información —todos los perfiles libres de una plataforma son equivalentes— y es
justo el paso que convierte una venta de cinco segundos en una de cinco minutos.

`soltar_cuenta()` coge el primer perfil libre ordenando por antigüedad de la
cuenta y número de slot. Es determinista, así que las cuentas se llenan una a
una en lugar de quedar todas a medias, que es lo que facilita darlas de baja
cuando toque.

## 4 · Por qué es una función de base de datos y no tres llamadas

Soltar una cuenta son tres escrituras: reservar el perfil, crear la asignación y
marcar el pedido. Hacerlas desde la aplicación deja abierta una carrera muy
concreta: dos aprobaciones simultáneas —o simplemente un doble clic en un móvil
con mala conexión— eligen **el mismo** perfil libre, y la segunda falla después
de haber marcado su pedido como entregado. El cliente vería «entregado» sin
tener nada.

Dentro de la función, `FOR UPDATE ... SKIP LOCKED` reserva el perfil antes de
tocar nada más, y todo ocurre en una transacción. Dos aprobaciones simultáneas
cogen perfiles distintos en lugar de bloquearse o pisarse.

La función es además **idempotente**: si el pedido ya está entregado, devuelve
`ya_entregado` con la asignación existente en vez de volver a asignar.

## 5 · Estados del pedido

| Estado                  | Qué significa                                    | Quién lo pone |
| ----------------------- | ------------------------------------------------ | ------------- |
| `esperando_comprobante` | Pedido creado, falta la captura                  | La aplicación |
| `esperando_revision`    | Comprobante subido, pendiente de verificar       | El cliente    |
| `entregado`             | Pago verificado y perfil asignado                | `soltar_cuenta` |
| `rechazado`             | El comprobante no era válido                     | El operador   |
| `cancelado`             | El cliente desistió antes de que se revisara     | El cliente    |

`esperando_revision` y `entregado` están separados a propósito. Un pago puede
ser correcto y aun así no haber cupo libre: `soltar_cuenta` devuelve `sin_cupos`
y el pedido se queda esperando. Fundir ambos estados escondería exactamente el
caso que hay que atender a mano.

Cada estado tiene su presentación en `src/features/orders/presentation.ts`, y un
test comprueba que la lista de allí y el enum de la migración no se separen.
Sin él, añadir un estado en SQL y olvidarlo en la interfaz deja la tarjeta del
historial leyendo `undefined.etiqueta` y reventando en el navegador, con el
pedido ya cobrado.

## 6 · Los comprobantes

Van a un bucket **privado** de Supabase Storage llamado `comprobantes`. Un
comprobante de SINPE lleva nombre completo, número de teléfono e importe: con un
bucket público quedaría accesible por URL a cualquiera que diera con la ruta, y
que el nombre del archivo sea difícil de adivinar no es una medida de seguridad.

La ruta es `{uuid-del-cliente}/{uuid-del-pedido}.{ext}`. La primera carpeta no
es cosmética: es lo que comprueba la política de `storage.objects`.

```sql
(storage.foldername(name))[1] = public.current_user_id()::text
```

Para revisarlo, el panel genera una **URL firmada de diez minutos**. Es tiempo
de sobra para mirarla y lo bastante corto para que un enlace copiado por error
no siga sirviendo mañana.

El límite de tamaño (5 MB) y los tipos permitidos están declarados en el bucket
**y** validados en la Server Action. El del bucket es la garantía real; el de la
acción existe para poder decir «tu captura pesa 12 MB» en lugar del error
genérico que devuelve Storage.

## 7 · El precio se congela

`orders.price_amount` guarda lo que el cliente vio al comprar. Si mañana sube la
tarifa, lo cobrado sigue siendo lo acordado.

Ese importe se copia **del servicio en el servidor**, nunca del formulario. Si
viniera del cliente, cualquiera podría comprar por un colón editando el HTML
antes de enviar.

## 8 · El aviso al operador

El número junto a «Pagos» en la navegación del panel es la notificación del
flujo. Va ahí y no en un canal externo porque el operador atiende los pagos
desde este mismo panel: un número en la barra le llega antes que un correo.

`orders` está en la publicación de Realtime, así que el contador puede pasar a
actualizarse solo cuando haga falta, sin cambiar nada del esquema.

## 9 · Qué hay que configurar

En el panel, **Pagos → Datos de cobro**: número de SINPE, a nombre de quién y
una frase de instrucciones. Es lo que el cliente ve en la pantalla de compra.

Vive en la tabla `payment_settings` (una sola fila, forzada por un `CHECK` sobre
la clave primaria) y no en variables de entorno para que cambiar el número sea
un formulario y no un redespliegue. El operador trabaja desde el móvil.

## 10 · Lo que todavía no hace

- **No hay renovación automática.** Una asignación puede tener fecha de
  vencimiento, pero cobrar el mes siguiente es un pedido nuevo.
- **No se avisa por WhatsApp.** El teléfono se recoge y el panel ofrece un
  enlace para escribir a mano; el envío automático es la integración pendiente
  descrita en `05-integraciones-futuras.md`.
- **No hay solicitud de cambio de PIN.** Aplazado a propósito hasta que este
  flujo esté rodado.
