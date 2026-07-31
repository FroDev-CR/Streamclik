import { z } from 'zod';

/**
 * Validación de variables de entorno.
 *
 * Se valida al importar, de modo que un fallo ocurre en el build o al arrancar y
 * no seis horas después, cuando llega el primer correo y el webhook descubre que
 * `SUPABASE_SERVICE_ROLE_KEY` está vacía. Ese fallo tardío es especialmente caro
 * aquí: el proveedor de correo reintenta unas cuantas veces y luego descarta el
 * mensaje, así que el PIN se pierde de forma definitiva.
 *
 * Separación deliberada entre esquema de cliente y de servidor: cualquier
 * variable sin el prefijo `NEXT_PUBLIC_` que se lea desde un Client Component
 * queda como `undefined` tras el bundling. Mantener los esquemas separados
 * convierte ese error silencioso en un error de tipos.
 */

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY'),

  /**
   * Omite RLS por completo. Sólo la usa el webhook de ingesta. Filtrarla
   * equivale a entregar la base de datos entera, de ahí que
   * `infrastructure/supabase/admin.ts` importe `server-only`.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Falta SUPABASE_SERVICE_ROLE_KEY'),

  /** Secreto compartido para verificar la firma HMAC del webhook de correo. */
  INBOUND_EMAIL_WEBHOOK_SECRET: z
    .string()
    .min(32, 'INBOUND_EMAIL_WEBHOOK_SECRET debe tener al menos 32 caracteres'),

  /** Clave AES-256-GCM (32 bytes en hexadecimal) para las credenciales. Ver ADR-0007. */
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'CREDENTIALS_ENCRYPTION_KEY debe ser 64 caracteres hexadecimales (32 bytes)'),

  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const clientSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  NEXT_PUBLIC_SITE_URL: true,
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Variables de servidor. Llamar sólo desde código de servidor.
 *
 * Es una función y no una constante exportada para que la validación no se
 * dispare durante la recolección de páginas estáticas del build, cuando el
 * entorno de ejecución todavía no está presente.
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Variables de entorno de servidor inválidas:\n${formatIssues(parsed.error)}\n\n` +
        'Copia .env.example a .env.local y complétalo.',
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Variables públicas, seguras en el navegador.
 *
 * Se leen una a una y no con `process.env` completo porque el bundler de Next
 * sustituye estáticamente cada acceso `process.env.NEXT_PUBLIC_X` por su valor;
 * el objeto `process.env` como tal no existe en el cliente.
 */
export function getClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    throw new Error(`Variables de entorno públicas inválidas:\n${formatIssues(parsed.error)}`);
  }

  return parsed.data;
}
