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
   * Clerk emite la identidad; Supabase la valida contra el JWKS de Clerk y la
   * expone en `auth.jwt()`. La autorización sigue en RLS (ADR-0003): estas dos
   * claves sólo deciden *quién* consulta, nunca *qué* puede ver.
   */
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .startsWith('pk_', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY debe empezar por pk_'),
  CLERK_SECRET_KEY: z.string().startsWith('sk_', 'CLERK_SECRET_KEY debe empezar por sk_'),

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

  /**
   * Resend se usa únicamente desde el servidor para mandar las credenciales
   * después de una entrega. La clave es opcional para que una instalación
   * nueva pueda arrancar antes de configurar el proveedor; la acción de entrega
   * informa al administrador si el correo quedó pendiente.
   */
  RESEND_API_KEY: z.string().startsWith('re_', 'RESEND_API_KEY debe empezar por re_').optional(),
  RESEND_FROM_EMAIL: z.string().email().default('cuentas@streamclick.xyz'),

  /**
   * Claves VAPID de las notificaciones push (`node scripts/generar-claves-vapid.mjs`).
   *
   * Opcionales para que una instalación nueva arranque sin configurarlas: sin
   * ellas la pantalla de pagos no ofrece activar los avisos y el envío se salta
   * en silencio, en vez de tumbar un pedido que por lo demás se guardó bien.
   *
   * No se rotan a la ligera: al cambiarlas, todas las suscripciones existentes
   * dejan de valer y hay que volver a dar permiso en cada dispositivo.
   */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:soporte@streamclick.xyz'),

  /**
   * Acceso a GoPlay, el proveedor de las cuentas de Disney+.
   *
   * Todo opcional a propósito: sin estas variables la aplicación arranca igual y
   * lo único que no funciona es pedir el código de una cuenta de ese proveedor,
   * que además lo dice en pantalla. Tumbar el arranque entero por una
   * integración de un solo servicio sería desproporcionado.
   *
   * `GOPLAY_TOKEN` es la vía de escape para cuando el login automático no sea
   * posible —por ejemplo si se activa Google Authenticator en la cuenta—: se
   * pega un token vigente y el cliente lo usa sin intentar iniciar sesión.
   * Ver `docs/12-codigos-de-goplay.md`.
   */
  GOPLAY_BASE_URL: z.string().url().default('https://api.goplay.com.co'),
  GOPLAY_EMAIL: z.string().email('GOPLAY_EMAIL debe ser un correo válido').optional(),
  GOPLAY_PASSWORD: z.string().min(1).optional(),
  GOPLAY_TOKEN: z.string().min(10).optional(),

  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const clientSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: true,
  NEXT_PUBLIC_SITE_URL: true,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: true,
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
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    throw new Error(`Variables de entorno públicas inválidas:\n${formatIssues(parsed.error)}`);
  }

  return parsed.data;
}
