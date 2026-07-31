import { describe, expect, it } from 'vitest';

import { ProcessInboundEmailUseCase } from '@/core/use-cases/process-inbound-email.use-case';
import type {
  InboundEmailRepository,
  IngestEmailInput,
  IngestEmailOutcome,
} from '@/core/ports/repositories';
import type { EmailParser, RawEmail } from '@/core/ports/email-parser';
import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';
import { NetflixEmailParser } from '@/infrastructure/email/parsers/netflix.parser';
import { silentLogger } from '@/lib/logger';

/**
 * Tests del caso de uso de ingesta con dobles en memoria.
 *
 * Se ejecutan sin Next, sin Postgres y sin red: es exactamente el retorno de
 * mantener `core/` libre de dependencias de framework (docs/adr/0002). Con el
 * caso de uso acoplado a Supabase, probar "un correo duplicado no crea un PIN"
 * exigiría una base de datos real.
 */

class FakeRepository implements InboundEmailRepository {
  readonly calls: IngestEmailInput[] = [];

  constructor(private readonly outcome: Result<IngestEmailOutcome, DomainError>) {}

  async ingest(input: IngestEmailInput): Promise<Result<IngestEmailOutcome, DomainError>> {
    this.calls.push(input);
    return this.outcome;
  }
}

/** Parser que lanza, para comprobar que un bug no pierde el correo. */
class ExplodingParser implements EmailParser {
  readonly serviceSlug = 'netflix';
  canHandle(): boolean {
    return true;
  }
  parse(): never {
    throw new Error('fallo interno del parser');
  }
}

function baseInput(overrides: Partial<Parameters<ProcessInboundEmailUseCase['execute']>[0]> = {}) {
  return {
    messageId: 'mensaje-1',
    to: 'netflix1@streamclick.com',
    from: '"Netflix" <info@account.netflix.com>',
    subject: 'Tu código de acceso temporal',
    text: 'Tu código de acceso temporal es 4821',
    html: null,
    receivedAt: new Date('2026-07-31T10:00:00Z'),
    rawPayload: { proveedor: 'test' },
    ...overrides,
  };
}

describe('ProcessInboundEmailUseCase', () => {
  it('extrae el código y lo envía al repositorio', async () => {
    const repository = new FakeRepository(ok({ status: 'created', pinId: 'pin-1' }));
    const useCase = new ProcessInboundEmailUseCase(
      [new NetflixEmailParser()],
      repository,
      silentLogger,
    );

    const result = await useCase.execute(baseInput());

    expect(result.ok).toBe(true);
    expect(repository.calls[0]?.code).toBe('4821');
    expect(repository.calls[0]?.parseStatus).toBe('parsed');
  });

  it('normaliza el destinatario antes de buscar la cuenta', async () => {
    const repository = new FakeRepository(ok({ status: 'created' }));
    const useCase = new ProcessInboundEmailUseCase(
      [new NetflixEmailParser()],
      repository,
      silentLogger,
    );

    // Mayúsculas y sub-dirección: sin normalizar, la cuenta no se encontraría y
    // el PIN se perdería en silencio, que es el modo de fallo más caro del
    // sistema porque nadie se entera hasta que un cliente reclama.
    await useCase.execute(baseInput({ to: 'Netflix1+etiqueta@StreamClick.com' }));

    expect(repository.calls[0]?.toAddress).toBe('netflix1@streamclick.com');
  });

  it('extrae la dirección de una cabecera con nombre para mostrar', async () => {
    const repository = new FakeRepository(ok({ status: 'created' }));
    const useCase = new ProcessInboundEmailUseCase(
      [new NetflixEmailParser()],
      repository,
      silentLogger,
    );

    await useCase.execute(baseInput());

    expect(repository.calls[0]?.fromAddress).toBe('info@account.netflix.com');
  });

  it('registra el correo aunque ningún parser lo acepte', async () => {
    const repository = new FakeRepository(ok({ status: 'unparsed' }));
    const useCase = new ProcessInboundEmailUseCase([], repository, silentLogger);

    const result = await useCase.execute(baseInput());

    // El correo se guarda igualmente: es material de diagnóstico y trazabilidad,
    // no un error que deba descartarse.
    expect(result.ok).toBe(true);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.parseStatus).toBe('unmatched');
    expect(repository.calls[0]?.code).toBeNull();
  });

  it('no pierde el correo cuando el parser lanza una excepción', async () => {
    const repository = new FakeRepository(ok({ status: 'unparsed' }));
    const useCase = new ProcessInboundEmailUseCase(
      [new ExplodingParser()],
      repository,
      silentLogger,
    );

    const result = await useCase.execute(baseInput());

    // Un parser que lanza es un bug, no un correo inválido. El cuerpo queda
    // guardado con parse_status='failed' para escribir el test de regresión.
    expect(result.ok).toBe(true);
    expect(repository.calls[0]?.parseStatus).toBe('failed');
    expect(repository.calls[0]?.parseError).toContain('fallo interno del parser');
  });

  it('propaga los fallos de infraestructura para que el proveedor reintente', async () => {
    const repository = new FakeRepository(err(DomainError.infrastructure('conexión rechazada')));
    const useCase = new ProcessInboundEmailUseCase(
      [new NetflixEmailParser()],
      repository,
      silentLogger,
    );

    const result = await useCase.execute(baseInput());

    // Es el único caso en que el webhook responde 500. La idempotencia por
    // message_id hace que el reintento resultante sea seguro.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INFRASTRUCTURE_ERROR');
    }
  });

  it('devuelve el desenlace duplicado sin tratarlo como error', async () => {
    const repository = new FakeRepository(ok({ status: 'duplicate' }));
    const useCase = new ProcessInboundEmailUseCase(
      [new NetflixEmailParser()],
      repository,
      silentLogger,
    );

    const result = await useCase.execute(baseInput());

    // El proveedor reintenta ante cualquier duda; el reintento debe responder 200
    // para que deje de insistir.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('duplicate');
    }
  });
});

describe('selección de parser', () => {
  it('ignora los correos de remitentes que no son del servicio', async () => {
    const repository = new FakeRepository(ok({ status: 'unparsed' }));
    const useCase = new ProcessInboundEmailUseCase(
      [new NetflixEmailParser()],
      repository,
      silentLogger,
    );

    const spam: Partial<RawEmail> = { from: 'promo@ofertas.example.com' };
    await useCase.execute(baseInput({ from: spam.from! }));

    expect(repository.calls[0]?.code).toBeNull();
    expect(repository.calls[0]?.parseStatus).toBe('unmatched');
  });
});
