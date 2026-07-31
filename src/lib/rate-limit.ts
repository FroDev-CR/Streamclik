/**
 * Limitador de ventana fija en memoria.
 *
 * ⚠️ LIMITACIÓN CONOCIDA: en Vercel las funciones son efímeras y no comparten
 * memoria entre instancias, así que el límite real es "N peticiones por
 * instancia" y no "N peticiones globales". Es una red de contención básica
 * frente a bucles accidentales, **no** una defensa frente a un atacante
 * decidido.
 *
 * La protección real en producción es Upstash Redis o el firewall de Vercel. Se
 * documenta así en lugar de aparentar una garantía que no existe: creer que hay
 * rate limiting cuando no lo hay es peor que saber que falta.
 *
 * Para el webhook de correo la exposición es limitada de todos modos, porque la
 * verificación de firma HMAC ya rechaza cualquier petición no firmada antes de
 * tocar la base de datos.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });

    // Purga oportunista de entradas caducadas. Sin ella, un atacante podría
    // agotar la memoria del proceso generando claves distintas indefinidamente.
    if (buckets.size > 5000) {
      for (const [existingKey, existingBucket] of buckets) {
        if (existingBucket.resetAt <= now) buckets.delete(existingKey);
      }
    }

    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}
