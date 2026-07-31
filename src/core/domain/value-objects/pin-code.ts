import { DomainError } from '@/core/shared/errors';
import { err, ok, type Result } from '@/core/shared/result';

/**
 * PinCode — código de verificación extraído de un correo.
 *
 * Encapsula la validación de formato en un solo sitio para que ningún parser
 * futuro pueda emitir basura hacia la base de datos. La restricción CHECK de
 * Postgres (`^[0-9]{4,8}$`) es la segunda barrera: esta clase da un mensaje de
 * error útil, y la base de datos garantiza la invariante pase lo que pase.
 */
export class PinCode {
  private constructor(readonly value: string) {}

  private static readonly PATTERN = /^\d{4,8}$/;

  static create(raw: string): Result<PinCode, DomainError> {
    // Los correos en HTML suelen intercalar espacios o guiones entre los dígitos
    // para mejorar la legibilidad ("1 2 3 4"). Se descartan antes de validar.
    const cleaned = raw.replace(/[\s\-–—]/g, '');

    if (!PinCode.PATTERN.test(cleaned)) {
      return err(
        DomainError.validation(`Código inválido: se esperaban entre 4 y 8 dígitos, se recibió "${raw}"`),
      );
    }

    return ok(new PinCode(cleaned));
  }

  /**
   * Descarta candidatos que casan con el patrón pero que casi con seguridad no
   * son un código de verificación.
   *
   * Los correos de Netflix están llenos de números de cuatro dígitos: el año del
   * pie de página, identificadores, importes. Sin este filtro, el patrón
   * genérico extrae "2026" del copyright con total confianza y el cliente recibe
   * un código que no funciona — un fallo peor que no recibir nada, porque parece
   * correcto.
   */
  static isPlausibleCode(candidate: string): boolean {
    const cleaned = candidate.replace(/[\s\-–—]/g, '');

    if (!PinCode.PATTERN.test(cleaned)) return false;

    // Años cercanos: casi siempre el copyright del pie del correo.
    if (cleaned.length === 4) {
      const asNumber = Number.parseInt(cleaned, 10);
      if (asNumber >= 1990 && asNumber <= 2100) return false;
    }

    // Todos los dígitos iguales ("0000", "1111"): relleno de plantilla.
    if (/^(\d)\1+$/.test(cleaned)) return false;

    return true;
  }

  /** Formato visual agrupado para pantallas grandes: "123456" → "123 456". */
  get formatted(): string {
    if (this.value.length === 6) {
      return `${this.value.slice(0, 3)} ${this.value.slice(3)}`;
    }
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
