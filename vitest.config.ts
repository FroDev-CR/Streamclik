import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Los tests cubren `core/` y los parsers: la lógica que puede probarse sin
 * levantar Next ni Postgres. Es exactamente el retorno de haber mantenido esa
 * capa libre de dependencias de framework (docs/adr/0002).
 *
 * Entorno `node`: no hay tests de componentes en el MVP. La lógica que merece
 * pruebas está fuera de React, y probar componentes exigiría jsdom y testing
 * library sin cubrir nada que no cubran ya el compilador y el propio parser.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),

      // `server-only` lanza al importarse fuera de un Server Component, que es
      // justo lo que hace útil ese guardia en producción: impide que
      // `supabase/admin.ts` o el cifrado de credenciales acaben en un bundle de
      // cliente. Bajo Vitest no hay entorno de React, así que se resuelve al
      // módulo vacío que el propio paquete expone para el runtime de servidor.
      'server-only': resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
