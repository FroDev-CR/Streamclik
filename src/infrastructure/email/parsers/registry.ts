import type { EmailParser } from '@/core/ports/email-parser';
import { DisneyPlusEmailParser } from './disney-plus.parser';
import { NetflixEmailParser } from './netflix.parser';

/**
 * Registro de parsers.
 *
 * Añadir Max o Prime Video consiste en implementar `EmailParser` y añadirlo
 * a este array. Ni el webhook, ni el caso de uso, ni la UI se modifican: es el
 * principio abierto/cerrado aplicado justo en el punto donde se sabe que va a
 * haber cambios (docs/05-integraciones-futuras.md).
 *
 * El orden importa poco porque `canHandle()` filtra por dominio del remitente y
 * los dominios no se solapan entre servicios.
 */
export const emailParsers: readonly EmailParser[] = [
  new NetflixEmailParser(),
  new DisneyPlusEmailParser(),
];

export function getParserForService(slug: string): EmailParser | undefined {
  return emailParsers.find((parser) => parser.serviceSlug === slug);
}
