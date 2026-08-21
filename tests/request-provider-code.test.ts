import { describe, expect, it, vi } from 'vitest';

import type { CodeProvider, ProviderEmail, ProviderFetchResult } from '@/core/ports/code-provider';
import type { Logger } from '@/core/ports/logger';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';
import { RequestProviderCodeUseCase } from '@/core/use-cases/request-provider-code.use-case';

const loggerMudo: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function correo(overrides: Partial<ProviderEmail> = {}): ProviderEmail {
  return {
    messageId: 'abc-123',
    receivedAt: new Date('2026-08-21T18:00:00Z'),
    from: 'disneyplus@trx.mail2.disneyplus.com',
    to: 'buzon@proveedor.invalid',
    subject: 'Tu cdigo de acceso nico para Disney+',
    text: null,
    html: '<table><tr><td>314159</td></tr></table>',
    ...overrides,
  };
}

function proveedorQueDevuelve(resultado: Result<ProviderFetchResult, DomainError>): CodeProvider {
  return { slug: 'goplay', fetchEmails: vi.fn().mockResolvedValue(resultado) };
}

/** Doble del caso de uso de ingesta: sólo interesa con qué se le llama. */
function ingestaQueDevuelve(...respuestas: Array<Result<{ status: string; pinId?: string }, DomainError>>) {
  const execute = vi.fn();
  for (const respuesta of respuestas) execute.mockResolvedValueOnce(respuesta);
  return { execute } as never;
}

describe('RequestProviderCodeUseCase', () => {
  it('persiste cada correo que devuelve el proveedor', async () => {
    const ingesta = ingestaQueDevuelve(ok({ status: 'ok', pinId: 'pin-1' }));
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(ok({ emails: [correo()], motivo: null })),
      ingesta,
      loggerMudo,
    );

    const resultado = await useCase.execute({
      providerProfileId: 'perfil-1',
      inboxEmail: 'buzon@proveedor.invalid',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.codigos).toBe(1);
  });

  it('usa el buzón de la cuenta como destino, no el que venga en el correo', async () => {
    // El RPC resuelve la cuenta por esa dirección. Si se usara la del proveedor
    // —un alias, otra capitalización— el PIN se guardaría sin cuenta y no lo
    // vería nadie: el fallo más caro de este sistema, porque es silencioso.
    const ingesta = ingestaQueDevuelve(ok({ status: 'ok', pinId: 'pin-1' }));
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(ok({ emails: [correo({ to: 'ALIAS@Proveedor.invalid' })], motivo: null })),
      ingesta,
      loggerMudo,
    );

    await useCase.execute({ providerProfileId: 'perfil-1', inboxEmail: 'buzon@proveedor.invalid' });

    expect((ingesta as unknown as { execute: ReturnType<typeof vi.fn> }).execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buzon@proveedor.invalid' }),
    );
  });

  it('prefija el identificador con el proveedor para no chocar con los del correo', async () => {
    const ingesta = ingestaQueDevuelve(ok({ status: 'ok', pinId: 'pin-1' }));
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(ok({ emails: [correo({ messageId: '999' })], motivo: null })),
      ingesta,
      loggerMudo,
    );

    await useCase.execute({ providerProfileId: 'perfil-1', inboxEmail: 'buzon@proveedor.invalid' });

    expect((ingesta as unknown as { execute: ReturnType<typeof vi.fn> }).execute).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'goplay:999' }),
    );
  });

  it('cuenta como duplicado el correo que ya se había guardado', async () => {
    // Pasa constantemente: el cliente pulsa el botón dos veces mientras espera.
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(ok({ emails: [correo()], motivo: null })),
      ingestaQueDevuelve(ok({ status: 'duplicate' })),
      loggerMudo,
    );

    const resultado = await useCase.execute({
      providerProfileId: 'perfil-1',
      inboxEmail: 'buzon@proveedor.invalid',
    });

    if (!resultado.ok) throw new Error('se esperaba éxito');
    expect(resultado.value.duplicados).toBe(1);
    expect(resultado.value.codigos).toBe(0);
  });

  it('propaga por qué no vino ningún correo', async () => {
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(ok({ emails: [], motivo: 'ya-leido' })),
      ingestaQueDevuelve(),
      loggerMudo,
    );

    const resultado = await useCase.execute({
      providerProfileId: 'perfil-1',
      inboxEmail: 'buzon@proveedor.invalid',
    });

    if (!resultado.ok) throw new Error('se esperaba éxito');
    expect(resultado.value.motivo).toBe('ya-leido');
    expect(resultado.value.correos).toBe(0);
  });

  it('deja el código en el log si no se pudo guardar', async () => {
    // El proveedor ya lo marcó como leído: no hay forma de volver a pedirlo. El
    // log es la última red antes de perderlo del todo.
    const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(ok({ emails: [correo()], motivo: null })),
      ingestaQueDevuelve(err(DomainError.infrastructure('Postgres caído'))),
      logger,
    );

    const resultado = await useCase.execute({
      providerProfileId: 'perfil-1',
      inboxEmail: 'buzon@proveedor.invalid',
    });

    expect(resultado.ok).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('no intenta persistir nada si el proveedor falla', async () => {
    const ingesta = ingestaQueDevuelve();
    const useCase = new RequestProviderCodeUseCase(
      proveedorQueDevuelve(err(DomainError.unauthorized('token caducado'))),
      ingesta,
      loggerMudo,
    );

    const resultado = await useCase.execute({
      providerProfileId: 'perfil-1',
      inboxEmail: 'buzon@proveedor.invalid',
    });

    expect(resultado.ok).toBe(false);
    expect((ingesta as unknown as { execute: ReturnType<typeof vi.fn> }).execute).not.toHaveBeenCalled();
  });
});
