import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';

/**
 * Lectura del inventario que tenemos comprado en GoPlay.
 *
 * Es lo que hace posible dar de alta una cuenta sin copiar un UUID a mano: su
 * listado ya trae el correo, la contraseña, el servicio y la fecha de
 * renovación. Función pura y separada del cliente HTTP, por lo mismo que el
 * resto: cada respuesta rara que aparezca se convierte en un test de tres
 * líneas.
 */

export interface GoPlayProfile {
  /** `provider_profile_id`. En GoPlay es un UUID, pero se trata como texto. */
  readonly id: string;
  /** Nombre del producto: «DISNEY PREMIUM 1 MES CUENTAS ORIGINAL». */
  readonly producto: string;
  /** Correo de la cuenta. Es a la vez el buzón que recibe los códigos. */
  readonly correo: string;
  readonly password: string | null;
  /** Slug de `streaming_services`, deducido del producto. `null` si no se reconoce. */
  readonly serviceSlug: string | null;
  readonly perfil: string | null;
  readonly pin: string | null;
  readonly renuevaEl: string | null;
  readonly admiteConsulta: boolean;
  readonly activo: boolean;
}

/**
 * Del nombre del producto al servicio de nuestro catálogo.
 *
 * Se busca por palabra clave y no por igualdad porque el nombre lleva coletillas
 * comerciales que cambian cada temporada («1 MES», «CUENTAS ORIGINAL», «PREMIUM»).
 * Anclar la comparación al nombre completo la rompería con cada promoción nueva.
 *
 * Ante un producto que no se reconoce se devuelve `null` y la pantalla pide que
 * el operador elija el servicio: adivinar mal metería una cuenta de Disney en el
 * catálogo de Netflix, y eso se descubre cuando un cliente no recibe su código.
 */
const SERVICIOS: ReadonlyArray<{ patron: RegExp; slug: string }> = [
  { patron: /netflix/i, slug: 'netflix' },
  { patron: /disney/i, slug: 'disney-plus' },
  { patron: /\bmax\b|hbo/i, slug: 'max' },
  { patron: /prime|amazon/i, slug: 'prime-video' },
];

export function deducirServicio(producto: string): string | null {
  return SERVICIOS.find(({ patron }) => patron.test(producto))?.slug ?? null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const texto = (v: unknown): string | null => {
  if (typeof v === 'number') return String(v);
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
};

export function mapGoPlayProfiles(body: unknown): Result<readonly GoPlayProfile[], DomainError> {
  if (!esObjeto(body)) {
    return err(DomainError.parseFailed('GoPlay devolvió algo que no es un objeto JSON'));
  }

  // Igual que en el resto de su API: el 200 no significa nada, manda `success`.
  if (body.success !== true || !Array.isArray(body.items)) {
    const motivo = typeof body.msg === 'string' ? body.msg.trim() : 'sin detalle';
    return err(DomainError.infrastructure(`GoPlay no devolvió el listado de cuentas: ${motivo}`));
  }

  const cuentas: GoPlayProfile[] = [];

  for (const bruto of body.items) {
    if (!esObjeto(bruto)) continue;

    const id = texto(bruto.id);
    const correo = texto(bruto.digital_account);

    // Sin identificador no se puede consultar el código, y sin correo no se
    // puede resolver la cuenta en la ingesta. Una fila sin cualquiera de los dos
    // no es importable, y mostrarla sólo llevaría a un alta rota.
    if (!id || !correo) continue;

    const producto = texto(bruto.name_type_digital_account) ?? '';

    cuentas.push({
      id,
      producto,
      correo: correo.toLowerCase(),
      password: texto(bruto.password),
      serviceSlug: deducirServicio(producto),
      perfil: texto(bruto.screen_profile),
      pin: texto(bruto.screen_pin),
      renuevaEl: texto(bruto.renewal_limit_date),
      admiteConsulta: bruto.check_emails === true,
      activo: bruto.active !== false,
    });
  }

  return ok(cuentas);
}
