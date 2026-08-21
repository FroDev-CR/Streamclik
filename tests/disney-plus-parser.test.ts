import { describe, expect, it } from 'vitest';

import type { RawEmail } from '@/core/ports/email-parser';
import { DisneyPlusEmailParser } from '@/infrastructure/email/parsers/disney-plus.parser';

function disneyEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    from: '010f019fcdb56cfe-88da6d6b-7980-4e6d-b2f1-9950e518cea6-000000@from-us-east-2.mail2.disneyplus.com',
    to: 'dis01@streamclick.xyz',
    subject: 'Your one-time passcode for Disney+',
    text: null,
    html: `
      <html>
        <body>
          <table>
            <tr><td>Here's your one-time passcode for Disney+</td></tr>
            <tr><td>Use this passcode to verify the email address associated with your MyDisney account.</td></tr>
            <tr><td style="font-size: 32px">804219</td></tr>
            <tr><td>Disney Streaming Services LLC, 500 S Buena Vista St.</td></tr>
          </table>
        </body>
      </html>
    `,
    ...overrides,
  };
}

describe('DisneyPlusEmailParser', () => {
  const parser = new DisneyPlusEmailParser();

  it('acepta el remitente de sobre real de Disney+', () => {
    expect(parser.canHandle(disneyEmail())).toBe(true);
  });

  it('acepta los avisos enviados desde Disney Online', () => {
    expect(
      parser.canHandle(
        disneyEmail({
          from: 'msprvs1=20676a4nzuoza=bounces-1-24@bounces.disneyonline.com',
          subject: 'Se ha modificado tu cuenta MyDisney',
        }),
      ),
    ).toBe(true);
  });

  it('extrae el código de seis dígitos del HTML realista', () => {
    const result = parser.parse(disneyEmail());

    expect(result).toMatchObject({
      code: '804219',
      codeType: 'signup',
      matchedPattern: 'passcode-etiquetado-en',
    });
  });

  it('admite dígitos separados cuando Disney cambia la presentación', () => {
    const result = parser.parse(
      disneyEmail({
        text: 'Tu código de verificación es 8 0 4 2 1 9',
        html: null,
        subject: 'Código de verificación de Disney+',
      }),
    );

    expect(result?.code).toBe('804219');
  });

  it('no inventa un código en un aviso de cuenta sin OTP', () => {
    const result = parser.parse(
      disneyEmail({
        subject: 'Se ha modificado tu cuenta MyDisney',
        text: 'La dirección de correo electrónico de tu cuenta se cambió correctamente.',
        html: null,
      }),
    );

    expect(result).toBeNull();
  });

  it('rechaza remitentes ajenos aunque imiten el asunto', () => {
    expect(parser.canHandle(disneyEmail({ from: 'fraude@ofertas.example.com' }))).toBe(false);
  });
  /**
   * Los correos que llegan por GoPlay pierden todos los caracteres no ASCII: no
   * los sustituyen, se los comen. El correo real dice «Tu cdigo de acceso nico».
   * Estos casos existen para que nadie "limpie" los patrones quitando la vocal
   * opcional creyendo que sobra.
   */
  describe('correos sin acentos (vía GoPlay)', () => {
    it('extrae el código con el texto mutilado y el número en su propia línea', () => {
      const result = parser.parse(
        disneyEmail({
          subject: 'Tu cdigo de acceso nico para Disney+',
          text: null,
          html: `
            <table>
              <tr><td>Tu cdigo de acceso nico para Disney+</td></tr>
              <tr><td>Es necesario que verifiques la direccin de correo electrnico asociada a tu cuenta de MyDisney con este cdigo de acceso que vencer en 15 minutos.</td></tr>
              <tr><td>314159</td></tr>
              <tr><td>Si no lo solicitaste, en el Centro de ayuda hay ms informacin.</td></tr>
            </table>
          `,
        }),
      );

      expect(result?.code).toBe('314159');
    });

    it('lo extrae también si el código va dentro de la frase', () => {
      // Es el escenario que hoy NO se da y que dejaría al parser sin nada si la
      // única regla fuese la de línea aislada.
      const result = parser.parse(
        disneyEmail({
          subject: 'Tu cdigo de acceso nico para Disney+',
          text: 'Tu cdigo de acceso nico es 314159 y vence en 15 minutos.',
          html: null,
        }),
      );

      expect(result?.code).toBe('314159');
    });

    it('clasifica como inicio de sesión pese a los acentos comidos', () => {
      const result = parser.parse(
        disneyEmail({
          subject: 'Tu cdigo de acceso nico para Disney+',
          text: 'Tu cdigo de acceso nico es 314159.',
          html: null,
        }),
      );

      expect(result?.codeType).toBe('login');
    });

    it('sigue sin inventarse un código cuando no lo hay', () => {
      const result = parser.parse(
        disneyEmail({
          subject: 'Se ha modificado tu cuenta MyDisney',
          text: 'La direccin de correo electrnico de tu cuenta se cambi correctamente el 2026.',
          html: null,
        }),
      );

      expect(result).toBeNull();
    });
  });
});
