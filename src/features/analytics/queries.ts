import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Resumen de visitas.
 *
 * Todo el trabajo lo hace `resumen_visitas()` en SQL: son cuatro agregados
 * sobre la misma ventana de tiempo, y traerse las filas para contarlas en
 * TypeScript movería miles de registros para devolver cuatro números.
 */

export interface ResumenVisitas {
  dias: number;
  visitas: number;
  sesiones: number;
  registros: number;
  paises: Array<{ country: string; total: number }>;
  paginas: Array<{ path: string; total: number }>;
  origenes: Array<{ referrer: string; total: number }>;
}

const VACIO: ResumenVisitas = {
  dias: 30,
  visitas: 0,
  sesiones: 0,
  registros: 0,
  paises: [],
  paginas: [],
  origenes: [],
};

export async function getResumenVisitas(
  dias = 30,
): Promise<{ data: ResumenVisitas; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('resumen_visitas', { p_dias: dias });

  if (error) {
    logger.error('No se pudo leer el resumen de visitas', { error: error.message });
    return { data: { ...VACIO, dias }, error: error.message };
  }

  return { data: (data ?? { ...VACIO, dias }) as unknown as ResumenVisitas, error: null };
}
