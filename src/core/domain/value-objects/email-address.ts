import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';

/**
 * EmailAddress — dirección de correo normalizada.
 *
 * Es un value object y no un `string` porque la normalización es una regla de
 * negocio con consecuencias reales en este sistema: el enrutamiento del webhook
 * busca la cuenta por su dirección de ingesta. Si un proveedor entrega
 * `Netflix1@StreamClick.com` y la comparación es sensible a mayúsculas, la
 * cuenta no se encuentra y **el PIN se pierde en silencio** — el peor tipo de
 * fallo, porque nadie se entera hasta que un cliente reclama.
 *
 * Centralizarlo aquí garantiza que la escritura y la búsqueda usen exactamente
 * la misma normalización.
 */
export class EmailAddress {
  private constructor(readonly value: string) {}

  /** Suficientemente estricto para atrapar erratas, sin pretender validar el RFC 5322. */
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  static create(raw: string): Result<EmailAddress, DomainError> {
    const normalized = raw.trim().toLowerCase();

    if (!normalized) {
      return err(DomainError.validation('El correo electrónico es obligatorio'));
    }
    if (normalized.length > 320) {
      return err(DomainError.validation('El correo electrónico excede la longitud máxima'));
    }
    if (!EmailAddress.PATTERN.test(normalized)) {
      return err(DomainError.validation(`Correo electrónico inválido: ${raw}`));
    }

    return ok(new EmailAddress(normalized));
  }

  /**
   * Elimina la sub-dirección: `netflix1+lo-que-sea@dominio.com` → `netflix1@dominio.com`.
   *
   * Algunos proveedores de correo añaden etiquetas al destinatario. Sin este
   * descarte, la búsqueda de la cuenta fallaría para correos perfectamente
   * legítimos. La misma normalización se aplica dentro del RPC de ingesta.
   */
  static normalizeForRouting(raw: string): string {
    const normalized = raw.trim().toLowerCase();
    const atIndex = normalized.lastIndexOf('@');
    if (atIndex === -1) return normalized;

    const localPart = normalized.slice(0, atIndex).split('+')[0];
    const domain = normalized.slice(atIndex + 1);
    return `${localPart}@${domain}`;
  }

  /**
   * Extrae la dirección de una cabecera con nombre para mostrar:
   * `"Netflix" <info@account.netflix.com>` → `info@account.netflix.com`.
   */
  static extractFromHeader(header: string): string {
    const match = header.match(/<([^>]+)>/);
    return (match?.[1] ?? header).trim().toLowerCase();
  }

  get domain(): string {
    return this.value.slice(this.value.lastIndexOf('@') + 1);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
