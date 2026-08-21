import type { CodeProvider, ProviderFetchResult } from '@/core/ports/code-provider';
import type { Logger } from '@/core/ports/logger';
import type { DomainError } from '@/core/shared/errors';
import { ok, type Result } from '@/core/shared/result';

import { GoPlayClient, type GoPlayClientOptions } from './goplay.client';
import { mapGoPlayResponse, motivoSinCodigo } from './goplay.mapper';

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

  async fetchEmails(providerProfileId: string): Promise<Result<ProviderFetchResult, DomainError>> {
    const respuesta = await this.client.checkEmails(providerProfileId);

    if (!respuesta.ok) {
      this.logger?.warn('goplay: fallo al consultar correos', {
        providerProfileId,
        code: respuesta.error.code,
        message: respuesta.error.message,
      });
      return respuesta;
    }

    const correos = mapGoPlayResponse(respuesta.value);
    if (!correos.ok) return correos;

    // El motivo se calcula aquí y no en el mapeador porque quien lo sabe es el
    // cuerpo crudo de la respuesta, que a partir del mapeo ya se ha perdido.
    const motivo = correos.value.length > 0 ? null : motivoSinCodigo(respuesta.value);

    if (motivo) this.logger?.info('goplay: sin código', { providerProfileId, motivo });

    return ok({ emails: correos.value, motivo });
  }
}
