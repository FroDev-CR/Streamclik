/**
 * Conversión de HTML a texto plano para el parsing.
 *
 * Es necesario y no opcional: los correos de Netflix entregan el código dentro
 * de tablas anidadas con estilos en línea, y la parte `text/plain` a menudo no
 * existe o llega vacía. Sin esta conversión, el parser trabajaría sobre `null` y
 * ningún código se extraería jamás.
 *
 * Se implementa a mano en lugar de añadir una dependencia porque el objetivo es
 * acotado: no hay que renderizar HTML, sólo obtener texto con los límites de
 * bloque preservados. Una librería de 200 KB para esto no se paga.
 *
 * El detalle que importa es **insertar un separador en los límites de bloque**.
 * Sin él, `<td>Tu código es</td><td>1234</td>` se convertiría en "Tu código
 * es1234" y los patrones anclados a contexto dejarían de casar.
 */

const BLOCK_TAGS = /<\/?(?:div|p|br|tr|td|th|table|li|ul|ol|h[1-6]|section|article)\b[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&aacute;': 'á',
  '&eacute;': 'é',
  '&iacute;': 'í',
  '&oacute;': 'ó',
  '&uacute;': 'ú',
  '&ntilde;': 'ñ',
  '&Aacute;': 'Á',
  '&Eacute;': 'É',
  '&Iacute;': 'Í',
  '&Oacute;': 'Ó',
  '&Uacute;': 'Ú',
  '&Ntilde;': 'Ñ',
};

export function htmlToText(html: string): string {
  return (
    html
      // `<script>` y `<style>` primero: su contenido no es texto visible y suele
      // contener números que producirían falsos positivos.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(BLOCK_TAGS, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(
        /&[a-z]+;|&#\d+;/gi,
        (entity) => NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? ' ',
      )
      // Se colapsan espacios pero se conservan los saltos de línea: los límites de
      // bloque son la señal que impide que texto de celdas distintas se fusione.
      .replace(/[ \t ]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  );
}

/**
 * Extrae la primera URL que satisfaga el predicado.
 *
 * Se usa para el enlace de acción ("Sí, fui yo"), que en los correos de Netflix
 * viene junto a otros muchos enlaces (ayuda, cancelar suscripción, redes
 * sociales) y hay que distinguirlo.
 */
export function extractUrl(html: string, predicate: (url: string) => boolean): string | null {
  const matches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);

  for (const match of matches) {
    const url = match[1];
    if (url && predicate(url)) return url;
  }

  return null;
}
