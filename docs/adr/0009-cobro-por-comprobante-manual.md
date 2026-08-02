# ADR-0009 · Cobro por comprobante manual y entrega con un botón

**Estado:** aceptado · 2026-08-02
**No toca:** [ADR-0003](0003-rls-como-frontera-de-autorizacion.md)
**Relacionado:** [ADR-0005](0005-server-actions-vs-route-handlers.md)

## Contexto

Hasta ahora las cuentas se asignaban a mano desde el banco: el operador elegía
perfil y cliente en un desplegable. El cobro ocurría por fuera del sistema, por
WhatsApp, y no quedaba registro de qué se había cobrado ni por qué se había
entregado un perfil.

Las dos formas de resolverlo eran una pasarela de pago o un comprobante manual.

Una pasarela (Stripe, Tilopay, ONVO) automatiza la confirmación, pero en Costa
Rica implica alta de comercio con verificación de negocio, comisión por
transacción y pedirle al cliente los datos de su tarjeta. Para un producto que
todavía no ha hecho su primera venta, es un coste alto pagado por adelantado
contra una demanda que aún no está demostrada.

SINPE Móvil es lo que la gente usa aquí. No tiene comisión, no exige alta de
comercio y el cliente ya sabe usarlo. Lo que no tiene es confirmación
automática: alguien tiene que mirar el comprobante.

## Decisión

**El cliente paga por SINPE y sube la captura; el operador verifica y entrega
con un botón.**

1. El pedido es una fila en `orders` con su propio ciclo de estados, no un campo
   en la asignación. Un pedido existe antes de que exista la asignación, y sigue
   existiendo si se rechaza: es el registro de qué se cobró.

2. El precio se **congela** en el pedido al crearlo, copiado del servicio en el
   servidor. Un cambio de tarifa no reescribe lo ya vendido, y el importe no
   puede llegar desde el formulario.

3. Los comprobantes van a un bucket **privado** con políticas sobre
   `storage.objects`; el panel los abre con URL firmada de diez minutos.

4. La entrega es una función de base de datos, `soltar_cuenta(order_id)`, con
   `SECURITY DEFINER` y comprobación explícita de administrador dentro.

5. El operador **no elige** qué perfil se entrega. La función coge el primero
   libre de esa plataforma.

## Consecuencias

**A favor**

- Se puede cobrar hoy, sin alta de comercio ni comisiones.
- Queda registro auditable de cada venta: quién, cuánto, cuándo y qué se
  entregó.
- La carrera de la doble aprobación es imposible por construcción. El
  `FOR UPDATE ... SKIP LOCKED` dentro de la transacción reserva el perfil antes
  de tocar el pedido; dos aprobaciones simultáneas cogen perfiles distintos.
- La función es idempotente: un segundo clic devuelve la asignación existente en
  vez de duplicarla.
- Cuando llegue una pasarela, `soltar_cuenta` no cambia. Sólo cambia quién la
  llama.

**En contra**

- Cada venta cuesta una revisión humana. Es el precio explícito de esta
  decisión, y es lo primero que dejará de escalar.
- Entre que el cliente paga y el operador mira pasa un tiempo indefinido. Se
  mitiga diciéndolo claramente en pantalla («Comprobando pago») en vez de
  fingir inmediatez.
- Un comprobante falsificado pasa si el operador no lo mira con atención. No hay
  verificación contra el banco: no existe una API pública de SINPE para eso.

## Alternativas descartadas

**Pasarela de pago desde el principio.** Descartada por coste de alta y
comisión antes de la primera venta, no por dificultad técnica. Es la evolución
natural en cuanto el volumen justifique la revisión automática.

**Aprobar y asignar desde la aplicación, en tres llamadas.** Descartada por la
carrera: dos aprobaciones simultáneas eligen el mismo perfil libre y la segunda
falla **después** de haber marcado su pedido como entregado. El cliente vería
«entregado» sin tener nada, y el estado quedaría corrupto sin error visible.

**Que el operador elija el perfil concreto al aprobar.** Descartada porque no
aporta información —todos los perfiles libres de una plataforma son
equivalentes— y multiplica por diez el tiempo de cada venta. Era, además, lo
que el operador pidió expresamente evitar.

**Borrar los pedidos rechazados.** Descartada: un pedido rechazado es la prueba
de que alguien dijo haber pagado. Rechazar es un cambio de estado.
