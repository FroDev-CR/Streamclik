import type { Logger } from '@/core/ports/logger';

/**
 * Logger estructurado en JSON.
 *
 * Una línea por evento con contexto en campos, no interpolado en el mensaje: así
 * se puede consultar por `messageId` o por `status` en los logs de Vercel sin
 * recurrir a expresiones regulares sobre texto libre.
 *
 * `redact()` elimina secretos antes de escribir. Es imprescindible en este
 * sistema: el pipeline maneja códigos de verificación y contraseñas de cuentas
 * reales, y los logs de Vercel son visibles para todo el equipo y se conservan.
 * Un PIN filtrado en un log sigue siendo válido durante 15 minutos.
 */

const REDACTED = '[redactado]';

const SENSITIVE_KEYS = new Set([
  'code',
  'pin',
  'password',
  'login_password_enc',
  'loginPasswordEnc',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'signature',
  'apiKey',
  'service_role_key',
]);

function redact(context: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = redact(value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }

  return output;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  // En desarrollo el ruido de `debug` estorba más de lo que ayuda.
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? redact(context) : {}),
  };

  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger: Logger = {
  debug: (message, context) => write('debug', message, context),
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
};

/** Logger silencioso para los tests: mantiene limpia la salida del runner. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
