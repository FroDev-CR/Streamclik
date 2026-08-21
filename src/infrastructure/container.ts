import 'server-only';

import { ProcessInboundEmailUseCase } from '@/core/use-cases/process-inbound-email.use-case';
import { AssignProfileUseCase } from '@/core/use-cases/assign-profile.use-case';
import { RevokeAssignmentUseCase } from '@/core/use-cases/revoke-assignment.use-case';
import { RequestProviderCodeUseCase } from '@/core/use-cases/request-provider-code.use-case';
import { logger } from '@/lib/logger';

import { emailParsers } from './email/parsers/registry';
import { SupabaseInboundEmailRepository } from './repositories/supabase-inbound-email.repository';
import { SupabaseAssignmentRepository } from './repositories/supabase-assignment.repository';
import { createSupabaseAdminClient } from './supabase/admin';
import { createSupabaseServerClient } from './supabase/server';
import { GoPlayCodeProvider } from './providers/goplay/goplay.provider';
import { getServerEnv } from '@/lib/env';

/**
 * Composition root — el único lugar donde se decide qué implementación concreta
 * recibe cada puerto.
 *
 * Se implementa con funciones fábrica en vez de con un contenedor de inyección
 * de dependencias: en un proyecto de este tamaño, un contenedor añade magia en
 * tiempo de ejecución y pierde la comprobación de tipos, a cambio de ahorrar
 * unas pocas líneas. Aquí el grafo de dependencias es visible y lo verifica el
 * compilador.
 *
 * Las fábricas se crean por petición, no como singletons de módulo: el cliente
 * de servidor depende de las cookies de la petición en curso, y un singleton
 * compartiría la sesión de un usuario con el siguiente en un entorno serverless
 * que reutiliza instancias.
 */

/**
 * Caso de uso de ingesta de correo. Usa el cliente ADMINISTRATIVO porque el
 * webhook no tiene sesión de usuario y el RPC está revocado para los roles
 * públicos. Es la única fábrica de este archivo que omite RLS.
 */
export function makeProcessInboundEmailUseCase(): ProcessInboundEmailUseCase {
  const admin = createSupabaseAdminClient();
  return new ProcessInboundEmailUseCase(
    emailParsers,
    new SupabaseInboundEmailRepository(admin),
    logger,
  );
}

/** Asignación de perfiles. Usa el cliente con sesión: RLS exige rol admin. */
export async function makeAssignProfileUseCase(): Promise<AssignProfileUseCase> {
  const client = await createSupabaseServerClient();
  return new AssignProfileUseCase(new SupabaseAssignmentRepository(client), logger);
}

export async function makeRevokeAssignmentUseCase(): Promise<RevokeAssignmentUseCase> {
  const client = await createSupabaseServerClient();
  return new RevokeAssignmentUseCase(new SupabaseAssignmentRepository(client), logger);
}

/**
 * Consulta de código a GoPlay.
 *
 * Usa el cliente ADMINISTRATIVO por la misma razón que la ingesta del webhook:
 * el RPC está revocado para los roles públicos, y quien dispara esto es un
 * cliente cuyas políticas —correctamente— no le dejan escribir un PIN. Es una
 * operación del sistema desencadenada por el usuario, no una operación del
 * usuario.
 *
 * La autorización de "¿es tuya esta cuenta?" ocurre antes, en la Server Action,
 * leyendo con el cliente con sesión: ahí sí manda RLS.
 */
export function makeRequestGoPlayCodeUseCase(): RequestProviderCodeUseCase {
  const env = getServerEnv();

  const provider = new GoPlayCodeProvider({
    baseUrl: env.GOPLAY_BASE_URL,
    origin: env.GOPLAY_ORIGIN,
    token: env.GOPLAY_TOKEN ?? null,
    credentials:
      env.GOPLAY_EMAIL && env.GOPLAY_PASSWORD
        ? { email: env.GOPLAY_EMAIL, password: env.GOPLAY_PASSWORD }
        : null,
    logger,
  });

  return new RequestProviderCodeUseCase(provider, makeProcessInboundEmailUseCase(), logger);
}
