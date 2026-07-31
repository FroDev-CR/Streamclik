#!/usr/bin/env node
/**
 * Regenera `supabase/setup.sql` concatenando todas las migraciones.
 *
 * Ese archivo existe para instalar el esquema pegándolo en el SQL Editor de
 * Supabase, sin CLI ni Docker. La fuente de verdad siguen siendo los archivos de
 * `supabase/migrations/`; este script sólo los une.
 *
 * Ejecutar después de añadir cualquier migración nueva:
 *   node scripts/build-setup-sql.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
const OUTPUT = 'supabase/setup.sql';

const HEADER = `-- =============================================================================
-- StreamClick — instalación completa del esquema en un solo paso
-- =============================================================================
-- GENERADO AUTOMÁTICAMENTE. No editar a mano.
-- Regenerar con:  node scripts/build-setup-sql.mjs
--
-- Este archivo concatena, en orden, todas las migraciones de
-- supabase/migrations/. Existe para poder instalar el esquema pegándolo en el
-- SQL Editor de Supabase, sin instalar la CLI ni Docker.
--
-- La fuente de verdad siguen siendo los archivos de supabase/migrations/: si vas
-- a trabajar con la CLI (\`supabase db push\`), usa esos y ignora este archivo.
--
-- Cómo usarlo:
--   1. Panel de Supabase → SQL Editor → New query
--   2. Pega todo este contenido y ejecuta (Run)
--   3. Debe terminar sin errores. Es idempotente sólo en la semilla del
--      catálogo; ejecutarlo dos veces sobre la misma base fallará al recrear
--      los tipos, que es el comportamiento correcto.
-- =============================================================================
`;

// Orden alfabético = orden cronológico, porque los nombres llevan prefijo de
// marca temporal. Es la misma convención que usa la CLI de Supabase.
const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`No se encontraron migraciones en ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const parts = [HEADER];

for (const file of files) {
  parts.push('', `-- ▼▼▼ ${file} ▼▼▼`, '', readFileSync(join(MIGRATIONS_DIR, file), 'utf8'), '');
}

writeFileSync(OUTPUT, parts.join('\n'), 'utf8');

console.log(`${OUTPUT} generado a partir de ${files.length} migraciones:`);
for (const file of files) console.log(`  · ${file}`);
