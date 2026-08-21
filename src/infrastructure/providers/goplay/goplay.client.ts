import { DomainError } from '@/core/shared/errors';
import type { Logger } from '@/core/ports/logger';
import { err, ok, type Result } from '@/core/shared/result';

/**
 * Cliente HTTP de GoPlay.
 *
 * Aísla las dos rarezas de su API para que no se filtren al resto del sistema:
 * responde **200 aunque falle** y guarda la sesión en un token opaco que hay que
 * renovar iniciando sesión otra vez.
 *
 * El token se cachea **en la instancia**, no en un singleton de módulo con
 * ambición de permanencia: en Vercel las funciones son efímeras y cada arranque
 * en frío hará un login nuevo. Es aceptable —un login extra por instancia— y es
 * la razón de que el cliente no intente ser listo con la caducidad: no la
 * conocemos, así que en lugar de adivinarla se reintenta una vez cuando la
 * respuesta huele a sesión caducada.
 */

export interface GoPlayCredentials {
  /** Correo del operador en GoPlay. */
  readonly email: string;
  readonly password: string;
}

export interface GoPlayClientOptions {
  readonly baseUrl?: string;
  /**
   * Valor de la cabecera `Origin`.
   *
   * No es opcional para ellos aunque lo parezca: su backend lee
   * `$_SERVER['HTTP_ORIGIN']` sin comprobar que exista, así que una petición sin
   * `Origin` —cualquiera hecha fuera de un navegador— revienta con
   * `Undefined array key "HTTP_ORIGIN"` y contesta `success: false`. El síntoma
   * es idéntico al de una contraseña incorrecta, que es lo que lo hace caro de
   * diagnosticar.
   */
  readonly origin?: string;
  /**
   * Token ya emitido. Sirve de vía de escape si algún día se activa Google
   * Authenticator en la cuenta: con 2FA el login automático deja de ser posible
   * y hay que pegar un token a mano.
   */
  readonly token?: string | null;
  readonly credentials?: GoPlayCredentials | null;
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Logger;
}

const BASE_POR_DEFECTO = 'https://api.goplay.com.co';

/** Subdominio del revendedor: es el `Origin` que su API espera ver. */
const ORIGEN_POR_DEFECTO = 'https://mypantalla.goplay.com.co';

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Extrae el token de la respuesta de login.
 *
 * Verificado contra el servidor real el 2026-08-21: la respuesta trae
 * `{ token, profile, company, menu, success }` y el token va en la raíz, en
 * `token`, con 55 caracteres. Se comprueba una sola ubicación a propósito: si
 * algún día la cambian, preferimos un fallo ruidoso aquí que un token leído de
 * un sitio equivocado.
 */
function extraerToken(cuerpo: Record<string, unknown>): string | null {
  const token = cuerpo.token;
  return typeof token === 'string' && token.length >= 10 ? token : null;
}

export class GoPlayClient {
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly credentials: GoPlayCredentials | null;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger | null;
  private token: string | null;

  constructor(options: GoPlayClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? BASE_POR_DEFECTO).replace(/\/+$/, '');
    this.origin = (options.origin ?? ORIGEN_POR_DEFECTO).replace(/\/+$/, '');
    this.credentials = options.credentials ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? null;
    this.token = options.token ?? null;
  }

  /**
   * Pide los correos de un perfil. Devuelve el cuerpo **crudo**: interpretarlo
   * es cosa de `mapGoPlayResponse`, que es puro y se prueba sin red.
   */
  /**
   * Cabeceras que toda petición a GoPlay debe llevar. `Origin` y `Referer` van
   * porque su backend los da por hechos (ver `GoPlayClientOptions.origin`).
   */
  private cabeceras(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: this.origin,
      Referer: `${this.origin}/`,
      ...extra,
    };
  }

  async checkEmails(providerProfileId: string): Promise<Result<unknown, DomainError>> {
    const token = await this.obtenerToken();

    // Un login que falla NO se reintenta. Parece una distinción menor y no lo
    // es: si el operador cambia la contraseña en GoPlay, cada consulta haría dos
    // intentos de acceso fallidos, y la vía rápida para que un proveedor te
    // bloquee la cuenta es martillearle el login.
    if (!token.ok) return token;

    const primera = await this.peticion(providerProfileId, token.value);
    if (primera.ok || primera.error.code !== 'UNAUTHORIZED' || !this.credentials) return primera;

    // Aquí sí: el token que teníamos por bueno ha caducado. Se renueva y se
    // reintenta UNA vez.
    this.logger?.info('goplay: sesión caducada, renovando token');
    this.token = null;

    const renovado = await this.obtenerToken();
    if (!renovado.ok) return renovado;

    return this.peticion(providerProfileId, renovado.value);
  }

  private async peticion(
    providerProfileId: string,
    token: string,
  ): Promise<Result<unknown, DomainError>> {
    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(`${this.baseUrl}/api/v1/profiles-check-emails`, {
        method: 'POST',
        headers: this.cabeceras({ Authorization: `Bearer ${token}` }),
        body: JSON.stringify({ profile_id: providerProfileId }),
      });
    } catch (cause) {
      return err(DomainError.infrastructure('No se pudo contactar con GoPlay', cause));
    }

    if (respuesta.status === 401 || respuesta.status === 403) {
      return err(DomainError.unauthorized('GoPlay rechazó el token'));
    }

    if (!respuesta.ok) {
      return err(
        DomainError.infrastructure(`GoPlay respondió ${respuesta.status} al consultar correos`),
      );
    }

    try {
      return ok(await respuesta.json());
    } catch (cause) {
      return err(DomainError.infrastructure('GoPlay devolvió una respuesta ilegible', cause));
    }
  }

  private async obtenerToken(): Promise<Result<string, DomainError>> {
    if (this.token) return ok(this.token);

    if (!this.credentials) {
      return err(
        DomainError.unauthorized(
          'GoPlay no está configurado: falta el token o las credenciales del operador',
        ),
      );
    }

    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(`${this.baseUrl}/api/login`, {
        method: 'POST',
        headers: this.cabeceras(),
        body: JSON.stringify({
          email: this.credentials.email,
          password: this.credentials.password,
        }),
      });
    } catch (cause) {
      return err(DomainError.infrastructure('No se pudo contactar con GoPlay para iniciar sesión', cause));
    }

    if (!respuesta.ok) {
      return err(DomainError.infrastructure(`GoPlay respondió ${respuesta.status} al iniciar sesión`));
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (cause) {
      return err(DomainError.infrastructure('GoPlay devolvió un login ilegible', cause));
    }

    if (!esObjeto(cuerpo)) {
      return err(DomainError.infrastructure('GoPlay devolvió un login con forma inesperada'));
    }

    // Aquí es donde muerde el 200-aunque-falle: unas credenciales incorrectas
    // llegan como 200 con `success: false`. Sin esta comprobación seguiríamos
    // adelante sin token y el fallo aparecería más tarde, lejos de su causa.
    if (cuerpo.success === false) {
      const motivo = typeof cuerpo.msg === 'string' ? cuerpo.msg.trim() : 'sin detalle';
      return err(DomainError.unauthorized(`GoPlay rechazó el inicio de sesión: ${motivo}`));
    }

    // El segundo factor no se puede resolver desde el servidor: exige el código
    // que cambia cada treinta segundos en el teléfono del operador. Se falla con
    // un mensaje que dice exactamente qué hacer, en vez de dejar un 401 opaco.
    const perfil = esObjeto(cuerpo.profile) ? cuerpo.profile : null;
    if (perfil?.active_g2fa === true || cuerpo.active_g2fa === true) {
      return err(
        DomainError.unauthorized(
          'La cuenta de GoPlay tiene Google Authenticator activo: el login automático no es ' +
            'posible. Desactívalo, o pon un token vigente en GOPLAY_TOKEN.',
        ),
      );
    }

    const token = extraerToken(cuerpo);
    if (!token) {
      return err(
        DomainError.infrastructure('El login de GoPlay no devolvió ningún token reconocible'),
      );
    }

    this.token = token;
    return ok(token);
  }
}
