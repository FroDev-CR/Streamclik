import type { PinCodeType } from '@/core/domain/entities';
import { PinCode } from '@/core/domain/value-objects/pin-code';
import type { EmailParser, ParsedPin, RawEmail } from '@/core/ports/email-parser';

import { htmlToText } from '../html-to-text';

interface PatternRule {
  readonly name: string;
  readonly regex: RegExp;
}

const CODE = String.raw`(\d(?:[ \-–—]?\d){5})`;

/**
 * Disney envía el código en una línea aislada dentro de una tabla HTML. La
 * regla contextual cubre las variantes de texto; la regla de línea aislada
 * evita confundirlo con direcciones postales y años del pie del correo.
 *
 * ⚠️ Los correos que llegan a través de GoPlay vienen **sin acentos ni eñes**, y
 * no sustituidos sino *comidos*: el correo real dice «Tu cdigo de acceso nico».
 * Por eso cada patrón en español escribe la vocal acentuada como opcional
 * (`c[óo]?digo`, `verificaci[óo]?n`). Sin eso, las reglas contextuales no casan
 * nunca y el parser depende por completo de la regla de línea aislada — que hoy
 * funciona, pero se rompería en silencio el día que Disney meta el código
 * dentro de una frase. Ver `docs/12-codigos-de-goplay.md`.
 */
const PATTERNS: readonly PatternRule[] = [
  {
    name: 'passcode-etiquetado-en',
    regex: new RegExp(
      String.raw`(?:one[- ]time\s+passcode|verification\s+code|security\s+code)[^\d]{0,120}${CODE}`,
      'i',
    ),
  },
  {
    name: 'codigo-etiquetado-es',
    regex: new RegExp(
      String.raw`c[óo]?digo\s+de\s+(?:acceso|un\s+solo\s+uso|verificaci[óo]?n|seguridad)[^\d]{0,120}${CODE}`,
      'i',
    ),
  },
  {
    name: 'codigo-6-digitos-en-linea',
    regex: /(?:^|\n)\s*(\d{6})\s*(?:$|\n)/,
  },
  /**
   * Último recurso: el correo habla de un código y en algún punto cercano hay
   * seis dígitos seguidos.
   *
   * Va deliberadamente **después** de la regla de línea aislada, y no antes: es
   * la más permisiva de todas y sólo debe entrar cuando ninguna otra ha casado.
   * El salto puede atravesar cifras cortas —«vence en 15 minutos» va justo
   * antes del código en el correo real— que las reglas con `[^\d]` no pueden
   * cruzar. Se acota a 240 caracteres para que no alcance el pie del mensaje.
   */
  {
    name: 'codigo-etiquetado-laxo',
    regex: /c[óo]?digo[\s\S]{0,240}?(\d{6})/i,
  },
];

const TYPE_RULES: ReadonlyArray<{ type: PinCodeType; regex: RegExp }> = [
  {
    type: 'signup',
    regex: /(?:verify\s+(?:your|the)\s+email|verifica\s+tu\s+correo|crear\s+tu\s+cuenta)/i,
  },
  {
    type: 'password_reset',
    regex: /(?:reset\s+(?:your\s+)?password|restablec(?:er|e)\s+tu\s+contrase)/i,
  },
  {
    type: 'login',
    regex: /(?:one[- ]time\s+passcode|sign[- ]?in|iniciar\s+sesi[óo]?n|c[óo]?digo\s+de\s+acceso)/i,
  },
];

export class DisneyPlusEmailParser implements EmailParser {
  readonly serviceSlug = 'disney-plus';

  private static readonly SENDER_DOMAINS = [
    'disneyplus.com',
    'disneyonline.com',
    'disney.com',
    'mydisney.com',
  ];

  canHandle(email: RawEmail): boolean {
    const from = email.from.toLowerCase();

    return DisneyPlusEmailParser.SENDER_DOMAINS.some(
      (domain) => from.endsWith(`@${domain}`) || from.endsWith(`.${domain}`),
    );
  }

  parse(email: RawEmail): ParsedPin | null {
    const candidates = [email.text?.trim(), email.html ? htmlToText(email.html) : null].filter(
      (body): body is string => Boolean(body),
    );

    for (const body of candidates) {
      const haystack = `${email.subject}\n${body}`;

      for (const rule of PATTERNS) {
        const candidate = haystack.match(rule.regex)?.[1];
        if (!candidate || !PinCode.isPlausibleCode(candidate)) continue;

        const code = PinCode.create(candidate);
        if (!code.ok) continue;

        return {
          code: code.value.value,
          codeType: this.classify(haystack),
          actionUrl: null,
          matchedPattern: rule.name,
        };
      }
    }

    return null;
  }

  private classify(haystack: string): PinCodeType {
    for (const rule of TYPE_RULES) {
      if (rule.regex.test(haystack)) return rule.type;
    }
    return 'login';
  }
}
