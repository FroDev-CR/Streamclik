import type { CodeProvider, ProviderEmail } from '@/core/ports/code-provider';
import type { Logger } from '@/core/ports/logger';
import type { DomainError } from '@/core/shared/errors';
import { flatMap, type Result } from '@/core/shared/result';

import { GoPlayClient, type GoPlayClientOptions } from './goplay.client';
import { mapGoPlayResponse } from './goplay.mapper';

/**
 * Proveedor de códigos de GoPlay.
 *
 * Es sólo el pegamento entre el cliente HTTP (que hace I/O y no se prueba) y el
 * mapeador (que es puro y se prueba entero). Toda la lógica interesante está en
 * el segundo a propósito.
 */
export class GoPlayCodeProvider implements CodeProvider {
  readonly slug = 'goplay';

  private readonly client: GoPlayClient;
  private readonly logger: Logger | null;

  constructor(options: GoPlayClientOptions = {}) {
    this.client = new GoPlayClient(options);
    this.logger = options.logger ?? null;
  }

  async fetchEmails(
    providerProfileId: string,
  ): Promise<Result<readonly ProviderEmail[], DomainError>> {
    const respuesta = await this.client.checkEmails(providerProfileId);

    if (!respuesta.ok) {
      this.logger?.warn('goplay: fallo al consultar correos', {
        providerProfileId,
        code: respuesta.error.code,
        message: respuesta.error.message,
      });
    }

    return flatMap(respuesta, mapGoPlayResponse);
  }
}
