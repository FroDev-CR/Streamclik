/**
 * Puerto de logging.
 *
 * Existe para que los casos de uso puedan registrar eventos sin importar
 * `console` ni un SDK concreto de observabilidad, manteniendo `core/` libre de
 * dependencias. En los tests se inyecta un logger silencioso y la salida queda
 * limpia.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
