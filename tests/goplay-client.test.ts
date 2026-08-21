import { describe, expect, it, vi } from 'vitest';

import { GoPlayClient } from '@/infrastructure/providers/goplay/goplay.client';

/**
 * El cliente no se prueba contra GoPlay: se le inyecta `fetch`. Lo que se
 * comprueba aquí es el trato de sus rarezas —200 aunque falle, sesión que
 * caduca sin avisar— que es donde están los fallos silenciosos.
 */
function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const credenciales = { email: 'operador@ejemplo.invalid', password: 'secreto' };

describe('GoPlayClient', () => {
  it('inicia sesión y consulta con el token obtenido', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuesta({ success: true, token: 'token-de-prueba-123456' }))
      .mockResolvedValueOnce(respuesta({ success: false, msg: 'No se pudo obtener el código del correo. ' }));

    const client = new GoPlayClient({ credentials: credenciales, fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [, opciones] = fetchImpl.mock.calls[1]!;
    const cabeceras = opciones?.headers as Record<string, string>;
    expect(cabeceras.Authorization).toBe('Bearer token-de-prueba-123456');
    expect(opciones?.body).toBe(JSON.stringify({ profile_id: '42' }));
  });

  it('reutiliza el token en consultas sucesivas', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuesta({ success: true, token: 'token-de-prueba-123456' }))
      .mockImplementation(async () => respuesta({ success: false, msg: 'nada' }));

    const client = new GoPlayClient({ credentials: credenciales, fetchImpl });
    await client.checkEmails('42');
    await client.checkEmails('42');

    // Un login por instancia, no uno por consulta.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('trata el 200 con success:false del login como credenciales rechazadas', async () => {
    // La trampa central de esta API: un login fallido llega como 200. Sin esta
    // comprobación seguiríamos sin token y el fallo aparecería más tarde, lejos
    // de su causa.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => respuesta({ success: false, msg: 'Credenciales incorrectas' }));

    const client = new GoPlayClient({ credentials: credenciales, fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('UNAUTHORIZED');
    expect(resultado.error.message).toContain('Credenciales incorrectas');
  });

  it('explica qué hacer si la cuenta tiene Google Authenticator activo', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => respuesta({ success: true, token: 'token-de-prueba-123456', profile: { active_g2fa: true } }));

    const client = new GoPlayClient({ credentials: credenciales, fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.message).toContain('GOPLAY_TOKEN');
  });

  it('renueva la sesión una sola vez cuando el token caduca', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuesta({ success: true, token: 'token-viejo-1234567890' }))
      .mockResolvedValueOnce(respuesta({ msg: 'Unauthenticated.' }, 401))
      .mockResolvedValueOnce(respuesta({ success: true, token: 'token-nuevo-1234567890' }))
      .mockResolvedValueOnce(respuesta({ success: false, msg: 'nada' }));

    const client = new GoPlayClient({ credentials: credenciales, fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('no reintenta en bucle si el token nuevo también es rechazado', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuesta({ success: true, token: 'token-viejo-1234567890' }))
      .mockResolvedValueOnce(respuesta({ msg: 'Unauthenticated.' }, 401))
      .mockResolvedValueOnce(respuesta({ success: true, token: 'token-nuevo-1234567890' }))
      .mockResolvedValueOnce(respuesta({ msg: 'Unauthenticated.' }, 401));

    const client = new GoPlayClient({ credentials: credenciales, fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(false);
    // Reintentar sin descanso contra un login que rechaza es la vía rápida a que
    // nos bloqueen la cuenta del proveedor.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('funciona con un token puesto a mano, sin credenciales', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => respuesta({ success: false, msg: 'nada' }));

    const client = new GoPlayClient({ token: 'token-manual-1234567890', fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('avisa cuando no hay ni token ni credenciales', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new GoPlayClient({ fetchImpl });
    const resultado = await client.checkEmails('42');

    expect(resultado.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
