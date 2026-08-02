# Imágenes promocionales

Piezas listas para publicar. Se generan con código dentro de la propia
aplicación, así que la tipografía Kanit, los colores y el logotipo son
exactamente los de streamclick.xyz.

| Archivo | Tamaño | Para qué |
| --- | --- | --- |
| `streamclick-combo-netflix-disney.png` | 1080×1920 | Combo Netflix + Disney+ a ₡4 500 |
| `streamclick-combo-netflix-disney-max.png` | 1080×1920 | Combo Netflix + Disney+ + Max a ₡6 000 |
| `streamclick-estado-precios.png` | 1080×1920 | Estado de WhatsApp / historia con las cuatro plataformas |
| `streamclick-estado-netflix.png` | 1080×1920 | Estado empujando una sola plataforma |
| `streamclick-estado-disney.png` | 1080×1920 | Igual, con Disney+ |
| `streamclick-estado-max.png` | 1080×1920 | Igual, con Max |
| `streamclick-estado-prime.png` | 1080×1920 | Igual, con Prime Video |
| `streamclick-cuadrado.png` | 1080×1080 | Feed de Instagram o envío por chat |

## Las piezas no llevan el nombre de la plataforma

Sólo la marca de color. Es una decisión del operador y por eso la marca va
grande: si no hay nombre escrito, la marca carga sola con la identificación.
Disney lleva «D+» y no una «D» suelta por el mismo motivo.

Conviene saber que el reconocimiento no es igual para todas: un cuadro rojo con
«N» se lee como Netflix al instante, pero «D+», «M» y «P» dependen mucho más del
color, sobre todo en una miniatura.

Max se pinta violeta y no en su azul real: en las piezas de combo aparece junto
a Disney+, cuyo azul es casi el mismo, y las dos marcas se fundían en una sola
mancha.

## Los precios tienen que coincidir con la base de datos

Las imágenes son estáticas; la web lee `streaming_services.price_amount`. Si se
cambia un precio en una pieza y no en la base de datos, el cliente ve una cifra
en el estado y otra al entrar a comprar, y esa discusión la pierde el operador.

Precios de estas piezas: Netflix ₡3 000 · Disney+ ₡3 000 · Max ₡1 500 ·
Prime Video ₡2 500. La migración `20260802001200_max_en_el_catalogo.sql` los
deja alineados.

## Los combos todavía no se pueden comprar en la web

El flujo de compra vende **un servicio por pedido**. Un cliente que quiera el
combo tiene que hacer dos o tres pedidos por separado y pagaría la suma sin
descuento. Mientras no exista soporte de combos, esas ventas se cierran a mano
por WhatsApp.

## Regenerarlas

Se generaban desde una ruta temporal `src/app/promo/page.tsx` que se borra al
terminar, y se capturaban con Playwright apuntando al servidor de desarrollo.
No hay script permanente: son piezas de campaña, no un artefacto del build.
