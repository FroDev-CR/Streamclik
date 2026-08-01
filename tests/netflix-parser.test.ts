import { describe, expect, it } from 'vitest';

import { NetflixEmailParser } from '@/infrastructure/email/parsers/netflix.parser';
import type { RawEmail } from '@/core/ports/email-parser';

/**
 * Tests del parser de Netflix.
 *
 * El parser es una función pura, así que estos tests corren en milisegundos sin
 * base de datos ni servidor. Cuando un correo real falle en producción, el
 * cuerpo queda guardado en `inbound_emails` con `parse_status='failed'` y se
 * convierte aquí en un caso de regresión de tres líneas.
 */

const parser = new NetflixEmailParser();

function email(overrides: Partial<RawEmail>): RawEmail {
  return {
    from: 'info@account.netflix.com',
    to: 'netflix1@streamclick.com',
    subject: 'Tu código de acceso temporal de Netflix',
    text: null,
    html: null,
    ...overrides,
  };
}

describe('canHandle', () => {
  it('acepta los correos que provienen de un dominio de Netflix', () => {
    expect(parser.canHandle(email({}))).toBe(true);
    expect(parser.canHandle(email({ from: 'no-reply@members.netflix.com' }))).toBe(true);
  });

  it('rechaza remitentes que imitan a Netflix', () => {
    // Un correo de phishing con el asunto correcto no debe producir un PIN que
    // el cliente introduzca de buena fe en el sitio del atacante.
    expect(parser.canHandle(email({ from: 'info@netflix.attacker.com' }))).toBe(false);
    expect(parser.canHandle(email({ from: 'info@netflixx.com' }))).toBe(false);
  });

  it('descarta los correos promocionales antes de intentar el parsing', () => {
    expect(
      parser.canHandle(email({ subject: 'Novedades de esta semana en Netflix' })),
    ).toBe(false);
  });

  it('rechaza el remitente de sobre de un emisor masivo', () => {
    // Netflix entrega a través de SES, y su envelope sender (`MAIL FROM`) es un
    // identificador de rebote, no una dirección de Netflix.
    //
    // Este test documenta por qué el Worker de Cloudflare DEBE enviar la
    // cabecera `From` y no `message.from`: con el remitente de sobre, todos los
    // correos legítimos se rechazarían aquí y ningún código se extraería jamás.
    // El fallo es silencioso —el correo queda como "sin código", igual que un
    // promocional— y por eso costó tanto verlo en producción.
    expect(
      parser.canHandle(email({ from: '010f019fbdcf0972-cd1dd5@eu-west-1.amazonses.com' })),
    ).toBe(false);

    // La misma entrega, tomando la cabecera correcta, sí se acepta.
    expect(parser.canHandle(email({ from: 'info@account.netflix.com' }))).toBe(true);
  });
});

describe('parse — extracción del código', () => {
  it('extrae el código de un correo de verificación de hogar en español', () => {
    const result = parser.parse(
      email({
        subject: 'Importante: cómo actualizar tu Hogar con Netflix',
        text: 'Tu código de acceso temporal es 4821. Caduca en 15 minutos.',
      }),
    );

    expect(result?.code).toBe('4821');
    expect(result?.codeType).toBe('household');
  });

  it('extrae el código de un correo de inicio de sesión en inglés', () => {
    const result = parser.parse(
      email({
        subject: 'Your Netflix sign-in code',
        text: 'Your verification code is 739104',
      }),
    );

    expect(result?.code).toBe('739104');
    expect(result?.codeType).toBe('login');
  });

  it('extrae el código desde el HTML cuando no hay parte de texto plano', () => {
    // Es el caso habitual: Netflix envía el código dentro de tablas anidadas y
    // la parte text/plain a menudo no existe. Sin la conversión de HTML, el
    // parser trabajaría sobre null y nunca extraería nada.
    const result = parser.parse(
      email({
        text: null,
        html: `
          <html><body>
            <table><tr><td>Tu código de verificación es:</td></tr>
            <tr><td><span style="font-size:32px">5502</span></td></tr></table>
            <p>&copy; 2026 Netflix</p>
          </body></html>
        `,
      }),
    );

    expect(result?.code).toBe('5502');
  });

  it('no confunde el año del pie de página con un código', () => {
    // El fallo más caro posible: el cliente recibe un código que parece válido y
    // lo intenta varias veces antes de reclamar.
    const result = parser.parse(
      email({
        subject: 'Netflix',
        html: '<p>Gracias por tu preferencia.</p><footer>&copy; 2026 Netflix Inc.</footer>',
      }),
    );

    expect(result).toBeNull();
  });

  it('ignora los rellenos de plantilla como "0000"', () => {
    const result = parser.parse(email({ text: 'Tu código es 0000' }));
    expect(result).toBeNull();
  });

  it('admite los dígitos separados por espacios en el HTML', () => {
    const result = parser.parse(
      email({
        text: null,
        html: '<div>Tu código de verificación es: <b>1 2 3 4 5 6</b></div>',
      }),
    );

    // Los correos en HTML intercalan espacios entre dígitos para mejorar la
    // legibilidad; el código real es la secuencia sin separadores.
    expect(result?.code).toBe('123456');
  });

  it('devuelve null cuando el correo no contiene ningún código', () => {
    const result = parser.parse(
      email({ subject: 'Tu recibo de Netflix', text: 'Gracias por tu pago mensual.' }),
    );

    expect(result).toBeNull();
  });
});

describe('parse — clasificación del tipo', () => {
  it('distingue un restablecimiento de contraseña', () => {
    const result = parser.parse(
      email({
        subject: 'Restablece tu contraseña de Netflix',
        text: 'Usa este código para restablecer tu contraseña: 665412',
      }),
    );

    expect(result?.codeType).toBe('password_reset');
  });

  it('marca como unknown lo que no encaja en ninguna categoría conocida', () => {
    const result = parser.parse(
      email({ subject: 'Netflix', text: 'Tu código: 884210' }),
    );

    expect(result?.codeType).toBe('unknown');
  });
});

describe('parse — enlace de acción', () => {
  it('elige el enlace de confirmación y no los demás del correo', () => {
    const result = parser.parse(
      email({
        text: 'Tu código de acceso temporal es 3312',
        html: `
          <a href="https://www.netflix.com/ayuda">Ayuda</a>
          <a href="https://www.netflix.com/account/travel/verify?nftoken=abc">Sí, fui yo</a>
          <a href="https://www.netflix.com/cancelplan">Cancelar suscripción</a>
        `,
      }),
    );

    // Ofrecer el enlace equivocado llevaría al cliente a la página de
    // cancelación de la suscripción del operador.
    expect(result?.actionUrl).toBe('https://www.netflix.com/account/travel/verify?nftoken=abc');
  });
});
