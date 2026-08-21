import { describe, expect, it } from 'vitest';

import { DisneyPlusEmailParser } from '@/infrastructure/email/parsers/disney-plus.parser';
import { mapGoPlayResponse, motivoSinCodigo } from '@/infrastructure/providers/goplay/goplay.mapper';

import conCodigo from './fixtures/goplay-disney-codigo.json';
import sinCodigo from './fixtures/goplay-sin-codigo.json';
import yaLeido from './fixtures/goplay-ya-leido.json';

/**
 * Los fixtures reproducen respuestas reales de GoPlay del 2026-08-21, con el
 * código y las direcciones sustituidos. Conservan lo que rompe implementaciones
 * ingenuas: la doble codificación de `response` y los acentos comidos.
 */
describe('mapGoPlayResponse', () => {
  it('extrae el correo de una respuesta con código', () => {
    const resultado = mapGoPlayResponse(conCodigo);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value).toHaveLength(1);

    const correo = resultado.value[0]!;
    expect(correo.messageId).toBe('1755800000000000001');
    expect(correo.from).toBe('disneyplus@trx.mail2.disneyplus.com');
    expect(correo.html).toContain('314159');
  });

  it('deshace el escapado HTML del destinatario', () => {
    const resultado = mapGoPlayResponse(conCodigo);
    if (!resultado.ok) throw new Error('se esperaba éxito');

    // Zoho entrega `toAddress` como `&lt;alguien@dominio&gt;`. Si no se
    // desescapa, la dirección no casa con ninguna cuenta y el correo se
    // atribuiría a nadie.
    expect(resultado.value[0]!.to).toBe('cuenta@ejemplo.invalid');
  });

  it('usa la fecha del proveedor y no la de la consulta', () => {
    const resultado = mapGoPlayResponse(conCodigo);
    if (!resultado.ok) throw new Error('se esperaba éxito');

    expect(resultado.value[0]!.receivedAt.getTime()).toBe(1755800000000);
  });

  it('devuelve lista vacía —no error— cuando todavía no hay código', () => {
    const resultado = mapGoPlayResponse(sinCodigo);

    // Es el caso más frecuente en producción: el cliente pulsa el botón antes de
    // que llegue el correo. Tratarlo como error llenaría los logs de fallos que
    // no lo son.
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value).toHaveLength(0);
  });

  it('falla si dice que hay correo pero no manda `response`', () => {
    const resultado = mapGoPlayResponse({ success: true, msg: 'Enviado correctamente.' });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('PARSE_FAILED');
  });

  it('falla si `response` no es JSON válido', () => {
    const resultado = mapGoPlayResponse({ success: true, response: 'no soy json' });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('PARSE_FAILED');
  });

  it('descarta los correos sin identificador o sin fecha', () => {
    const interno = {
      result: 'success',
      items: [
        { messageId: null, receivedTime: '1755800000000', html: '<p>123456</p>' },
        { messageId: '99', receivedTime: null, html: '<p>123456</p>' },
        { messageId: '100', receivedTime: '1755800000000', html: null, summary: null },
      ],
    };

    const resultado = mapGoPlayResponse({ success: true, response: JSON.stringify(interno) });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value).toHaveLength(0);
  });

  it('no se traga un `response` que ya venga como objeto', () => {
    // Si algún día GoPlay dejara de serializar dos veces, queremos enterarnos
    // por un test y no por un cliente sin su código.
    const resultado = mapGoPlayResponse({ success: true, response: { result: 'success', items: [] } });

    expect(resultado.ok).toBe(false);
  });
});

/**
 * GoPlay entrega cada correo UNA SOLA VEZ: al devolverlo lo marca como leído y
 * después contesta «Este mensaje ya fue leido». Distinguir ese caso de «todavía
 * no ha llegado nada» es lo que separa un mensaje útil («pedile otro código a
 * Disney») de uno que manda al cliente a reintentar en vano.
 */
describe('motivoSinCodigo', () => {
  it('reconoce que el buzón está vacío', () => {
    expect(motivoSinCodigo(sinCodigo)).toBe('sin-correo');
  });

  it('reconoce que el correo ya se consumió', () => {
    expect(motivoSinCodigo(yaLeido)).toBe('ya-leido');
  });

  it('no adivina ante un mensaje que no conoce', () => {
    expect(motivoSinCodigo({ success: false, msg: 'Servicio en mantenimiento' })).toBe('desconocido');
  });

  it('tolera el acento y el espacio final que traen sus mensajes', () => {
    expect(motivoSinCodigo({ success: false, msg: 'No se pudo obtener el codigo del correo. ' })).toBe('sin-correo');
    expect(motivoSinCodigo({ success: false, msg: 'Este mensaje ya fue leído.' })).toBe('ya-leido');
  });
});

describe('GoPlay + DisneyPlusEmailParser', () => {
  const parser = new DisneyPlusEmailParser();

  it('extrae el código del correo real que entrega GoPlay', () => {
    const resultado = mapGoPlayResponse(conCodigo);
    if (!resultado.ok) throw new Error('se esperaba éxito');

    const correo = resultado.value[0]!;

    // La cadena completa sin red: respuesta de GoPlay -> correo crudo -> PIN.
    expect(parser.canHandle(correo)).toBe(true);

    const pin = parser.parse(correo);
    expect(pin).not.toBeNull();
    expect(pin?.code).toBe('314159');
    expect(pin?.codeType).toBe('login');
  });
});
