import type { PinCodeType } from '@/core/domain/entities';
import { PinCode } from '@/core/domain/value-objects/pin-code';
import type { EmailParser, ParsedPin, RawEmail } from '@/core/ports/email-parser';
import { extractUrl, htmlToText } from '../html-to-text';

/**
 * Parser de los correos de verificación de Netflix.
 *
 * Función pura: mismo correo de entrada, mismo resultado. Sin I/O, sin
 * `Date.now()`, sin aleatoriedad. Por eso los tests corren en milisegundos y
 * cada correo real que falla se convierte en un caso de regresión de tres
 * líneas.
 *
 * Soporta español e inglés porque Netflix envía el correo en el idioma de la
 * cuenta y el operador no controla ese ajuste en las cuentas que compra.
 */

interface PatternRule {
  readonly name: string;
  readonly regex: RegExp;
}

/**
 * Fragmento que captura el código admitiendo separadores entre dígitos.
 *
 * Los correos en HTML intercalan espacios o guiones para mejorar la legibilidad
 * ("1 2 3 4 5 6"), y la conversión a texto los conserva. Un `\d{4,6}` estricto
 * extraería sólo el primer dígito de esas secuencias. `PinCode.create()` limpia
 * después los separadores.
 */
const CODE = String.raw`(\d(?:[ \-–—]?\d){3,7})`;

/**
 * Hueco tolerado entre la palabra clave y el código.
 *
 * `[^\d]{0,40}` es la pieza que hace robusto el parser frente a la redacción
 * real de Netflix: "Tu código **de acceso temporal es** 4821" tiene 22
 * caracteres entre el literal y el número, y un patrón que exija el código
 * inmediatamente después de "código" falla con el correo más habitual del
 * sistema. El límite de 40 impide que el ancla salte a un número de otra frase.
 *
 * No puede tragarse el propio código: `[^\d]` no casa con dígitos, así que la
 * expansión codiciosa se detiene sola en el primer número.
 */
const GAP = String.raw`[^\d]{0,40}`;

/**
 * Patrones ordenados de MÁS a MENOS específico. El orden es la parte más
 * importante de este archivo.
 *
 * Los correos de Netflix están llenos de números de cuatro dígitos: el año del
 * copyright, importes, identificadores internos. Un patrón suelto extrae "2026"
 * del pie de página con total confianza, y el cliente recibe un código que no
 * funciona — un fallo peor que no recibir nada, porque parece correcto y el
 * usuario lo intenta varias veces antes de reclamar.
 *
 * Por eso todos los patrones están anclados a una palabra clave, y el genérico
 * queda como último recurso filtrado por `PinCode.isPlausibleCode()`.
 */
const PATTERNS: readonly PatternRule[] = [
  {
    name: 'codigo-etiquetado-es',
    regex: new RegExp(String.raw`c[óo]digo${GAP}${CODE}`, 'i'),
  },
  {
    name: 'code-etiquetado-en',
    regex: new RegExp(String.raw`\bcode\b${GAP}${CODE}`, 'i'),
  },
  {
    name: 'codigo-pospuesto-es',
    // Variante con el número delante: "4821 es tu código de acceso".
    regex: new RegExp(
      String.raw`${CODE}[^\n\d]{0,40}(?:es\s+tu\s+c[óo]digo|c[óo]digo\s+de\s+verificaci[óo]n)`,
      'i',
    ),
  },
  {
    name: 'code-pospuesto-en',
    regex: new RegExp(
      String.raw`${CODE}[^\n\d]{0,40}(?:is\s+your\s+code|verification\s+code)`,
      'i',
    ),
  },
  {
    name: 'generico-6-digitos',
    // Último recurso, y sólo de 6 dígitos aislados en su propia línea: la
    // mayoría de los falsos positivos (años, importes) son de 4.
    regex: /(?:^|\n)\s*(\d{6})\s*(?:$|\n)/,
  },
];

/** Clasificación del tipo de código, por asunto y cuerpo. */
const TYPE_RULES: ReadonlyArray<{ type: PinCodeType; regex: RegExp }> = [
  {
    type: 'household',
    regex: /(?:hogar|household|actualizar\s+hogar|update\s+household|temporary\s+access|acceso\s+temporal)/i,
  },
  {
    type: 'password_reset',
    regex: /(?:restablec|restablecer\s+contrase|reset\s+your\s+password|password\s+reset)/i,
  },
  {
    type: 'signup',
    regex: /(?:confirma\s+tu\s+correo|verify\s+your\s+email|completa\s+tu\s+registro|finish\s+signing\s+up)/i,
  },
  {
    type: 'login',
    regex: /(?:inicio\s+de\s+sesi[óo]n|iniciar\s+sesi[óo]n|sign[- ]?in|log\s?in|acceso\s+a\s+tu\s+cuenta)/i,
  },
];

export class NetflixEmailParser implements EmailParser {
  readonly serviceSlug = 'netflix';

  private static readonly SENDER_DOMAINS = [
    'netflix.com',
    'members.netflix.com',
    'account.netflix.com',
    'mailer.netflix.com',
  ];

  /**
   * Comprobación previa barata.
   *
   * Se verifica el dominio del remitente y no sólo el asunto: un correo de
   * phishing con el asunto "Tu código de Netflix" no debe producir un PIN que el
   * cliente introduzca de buena fe en algún sitio.
   */
  canHandle(email: RawEmail): boolean {
    const from = email.from.toLowerCase();

    const isNetflixSender = NetflixEmailParser.SENDER_DOMAINS.some(
      (domain) => from.endsWith(`@${domain}`) || from.endsWith(`.${domain}`),
    );

    if (!isNetflixSender) return false;

    // Descarte de promocionales antes del parsing completo: sin esto, un correo
    // de "novedades de la semana" con un año en el pie podría filtrarse hasta el
    // patrón genérico.
    const subject = email.subject.toLowerCase();
    const isPromotional = /(?:novedades|newsletter|recomendaci|te\s+recomendamos|new\s+on\s+netflix)/i.test(
      subject,
    );

    return !isPromotional;
  }

  parse(email: RawEmail): ParsedPin | null {
    // Se prueban ambos cuerpos en orden de fiabilidad en lugar de elegir uno por
    // su longitud: la parte `text/plain` de Netflix a veces es sólo un aviso de
    // "abre este correo en tu navegador", y descartar el HTML por eso dejaría el
    // código sin extraer. Probar los dos cubre las dos formas del mismo correo.
    const candidates = [email.text?.trim(), email.html ? htmlToText(email.html) : null].filter(
      (body): body is string => Boolean(body),
    );

    for (const body of candidates) {
      const haystack = `${email.subject}\n${body}`;

      for (const rule of PATTERNS) {
        const match = haystack.match(rule.regex);
        const candidate = match?.[1];

        if (!candidate) continue;

        // Filtro de plausibilidad: descarta años del copyright y rellenos de
        // plantilla ("0000") que casan con el patrón pero no son códigos.
        if (!PinCode.isPlausibleCode(candidate)) continue;

        const codeResult = PinCode.create(candidate);
        if (!codeResult.ok) continue;

        return {
          code: codeResult.value.value,
          codeType: this.classify(haystack),
          actionUrl: this.extractActionUrl(email),
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
    return 'unknown';
  }

  /**
   * Enlace de confirmación ("Sí, fui yo" / "Obtener código").
   *
   * Se filtra por ruta además de por dominio porque los correos de Netflix
   * incluyen muchos enlaces (ayuda, cancelar suscripción, redes sociales) y
   * ofrecer el equivocado al cliente lo llevaría a la página de cancelación.
   */
  private extractActionUrl(email: RawEmail): string | null {
    if (!email.html) return null;

    return extractUrl(email.html, (url) => {
      const lower = url.toLowerCase();
      if (!lower.includes('netflix.com')) return false;

      return /(?:verify|confirm|account\/travel|update-primary-location|household|login-help|otp)/.test(
        lower,
      );
    });
  }
}
