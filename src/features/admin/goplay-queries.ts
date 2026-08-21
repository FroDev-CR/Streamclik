import 'server-only';

import { makeGoPlayClient, goPlayEstaConfigurado } from '@/infrastructure/container';
import { mapGoPlayProfiles, type GoPlayProfile } from '@/infrastructure/providers/goplay/goplay.profiles';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Inventario comprado en GoPlay, cruzado con lo que ya tenemos dado de alta.
 *
 * Sustituye a copiar un UUID a mano en un SQL, que era el paso que no escalaba:
 * con una cuenta se aguanta, con veinte es un error esperando a ocurrir.
 */

export interface CuentaDeGoPlay extends GoPlayProfile {
  /** Ya existe en el banco. Se muestra igualmente, para que se vea el inventario completo. */
  readonly yaImportada: boolean;
  /** Servicio de nuestro catálogo, cuando el producto se reconoce. */
  readonly serviceId: string | null;
}

export interface InventarioDeGoPlay {
  readonly cuentas: readonly CuentaDeGoPlay[];
  readonly error: string | null;
  readonly configurado: boolean;
}

export async function getInventarioDeGoPlay(): Promise<InventarioDeGoPlay> {
  if (!goPlayEstaConfigurado()) {
    return {
      cuentas: [],
      configurado: false,
      error: 'Faltan las credenciales de GoPlay (GOPLAY_EMAIL y GOPLAY_PASSWORD).',
    };
  }

  const respuesta = await makeGoPlayClient().listProfiles();

  if (!respuesta.ok) {
    logger.error('No se pudo leer el inventario de GoPlay', { error: respuesta.error.message });
    return { cuentas: [], configurado: true, error: respuesta.error.message };
  }

  const cuentas = mapGoPlayProfiles(respuesta.value);
  if (!cuentas.ok) {
    return { cuentas: [], configurado: true, error: cuentas.error.message };
  }

  const supabase = await createSupabaseServerClient();

  // Dos consultas y no una por cuenta: el inventario de GoPlay se lee entero de
  // una vez y aquí sólo se cruza en memoria.
  const [{ data: importadas }, { data: servicios }] = await Promise.all([
    supabase.from('streaming_accounts').select('provider_profile_id').eq('code_provider', 'goplay'),
    supabase.from('streaming_services').select('id, slug'),
  ]);

  const yaEstan = new Set((importadas ?? []).map((fila) => fila.provider_profile_id));
  const porSlug = new Map((servicios ?? []).map((fila) => [fila.slug, fila.id]));

  return {
    configurado: true,
    error: null,
    cuentas: cuentas.value.map((cuenta) => ({
      ...cuenta,
      yaImportada: yaEstan.has(cuenta.id),
      serviceId: cuenta.serviceSlug ? (porSlug.get(cuenta.serviceSlug) ?? null) : null,
    })),
  };
}
