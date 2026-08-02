# Imágenes de promoción

Piezas listas para publicar en estados de WhatsApp, historias de Instagram y
feed. Generadas a partir de la propia aplicación —no con una fuente parecida—,
de modo que la tipografía Kanit, la paleta y el logotipo son exactamente los de
streamclick.xyz.

| Archivo | Tamaño | Para qué |
| --- | --- | --- |
| `streamclick-estado-precios.png` | 1080×1920 | Estado de WhatsApp / historia con las tres plataformas |
| `streamclick-estado-netflix.png` | 1080×1920 | Estado empujando una sola plataforma |
| `streamclick-estado-disney.png` | 1080×1920 | Igual, con Disney+ |
| `streamclick-cuadrado.png` | 1080×1080 | Feed de Instagram o envío por chat |

## Los precios están quemados en la imagen

Salieron de `streaming_services.price_amount` en el momento de generarlas
(₡3 500 / ₡3 000 / ₡2 500). **Si cambias un precio desde el panel, estas
imágenes quedan desactualizadas**: no se regeneran solas. Hay que rehacerlas.

## Cómo se regeneran

No hay script permanente a propósito: es una tarea puntual, no parte del build,
y una ruta `/promo` viva en producción sería una página pública sin motivo.

El procedimiento es el mismo que el de verificación visual descrito en
`HANDOFF.md`: se crea una ruta temporal que compone las piezas con tamaño fijo
en píxeles, se levanta el servidor de desarrollo y se captura cada una con
`locator.screenshot()` de Playwright, que respeta el tamaño exacto del elemento.

Dos detalles que costaron una pasada:

- **Nada de emoji.** El contenedor no tiene fuente de emoji a color, así que ⚡ y
  ✓ salen como contornos finos que desaparecen en miniatura. Van dibujados como
  SVG.
- **Hay que ocultar `nextjs-portal`.** El indicador de desarrollo flota sobre la
  página y se colaba recortado en el borde izquierdo de las capturas.

## Lo que no llevan

- **Número de WhatsApp.** La llamada a la acción es el dominio. Añadirlo es una
  línea, pero el número vive en `payment_settings`, no en el repositorio.
- **Disponibilidad.** Muestran precio, nunca cupos. Publicar una plataforma que
  no está cargada en el banco genera pedidos que no se pueden entregar.
