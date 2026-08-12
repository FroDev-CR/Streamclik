import { describe, expect, it } from 'vitest';

import { encryptPayload } from '@/lib/web-push';

/**
 * Vectores del RFC 8291, apéndice A.
 *
 * Merece la pena probar el cifrado con datos conocidos y no sólo comprobar que
 * "no lanza": si una derivación está mal, el código sigue produciendo un buffer
 * de aspecto perfectamente razonable y es **el navegador** quien lo descarta, en
 * silencio y sin avisar a nadie. El fallo se manifestaría como «las
 * notificaciones no llegan», que no apunta en absoluto a su causa.
 *
 * https://www.rfc-editor.org/rfc/rfc8291#appendix-A
 */

const RFC = {
  texto: 'When I grow up, I want to be a watermelon',
  // Claves del receptor (el navegador).
  p256dh:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  // Material del emisor, fijado para que el resultado sea reproducible.
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  serverPrivateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  // Cuerpo completo esperado: cabecera + contenido cifrado.
  esperado:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('Cifrado de Web Push (RFC 8291)', () => {
  it('reproduce exactamente el vector del apéndice A', () => {
    const cuerpo = encryptPayload(
      RFC.texto,
      { p256dh: RFC.p256dh, auth: RFC.auth },
      {
        salt: Buffer.from(RFC.salt, 'base64url'),
        serverPrivateKey: Buffer.from(RFC.serverPrivateKey, 'base64url'),
      },
    );

    expect(cuerpo.toString('base64url')).toBe(RFC.esperado);
  });

  it('escribe la cabecera con la forma que exige el RFC 8188', () => {
    const cuerpo = encryptPayload(
      RFC.texto,
      { p256dh: RFC.p256dh, auth: RFC.auth },
      {
        salt: Buffer.from(RFC.salt, 'base64url'),
        serverPrivateKey: Buffer.from(RFC.serverPrivateKey, 'base64url'),
      },
    );

    // salt(16) | tamaño de registro(4) | longitud de clave(1) | clave(65)
    expect(cuerpo.subarray(0, 16).toString('base64url')).toBe(RFC.salt);
    expect(cuerpo.readUInt32BE(16)).toBe(4096);
    expect(cuerpo[20]).toBe(65);
    // Punto P-256 sin comprimir: siempre empieza por 0x04.
    expect(cuerpo[21]).toBe(0x04);
  });

  it('cambia el resultado en cada envío aunque el mensaje sea idéntico', () => {
    // El salt y la clave efímera son aleatorios por diseño: dos avisos iguales
    // no deben producir el mismo texto cifrado.
    const uno = encryptPayload(RFC.texto, { p256dh: RFC.p256dh, auth: RFC.auth });
    const dos = encryptPayload(RFC.texto, { p256dh: RFC.p256dh, auth: RFC.auth });

    expect(uno.toString('base64url')).not.toBe(dos.toString('base64url'));
  });
});
