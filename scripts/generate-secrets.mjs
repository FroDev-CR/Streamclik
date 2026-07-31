#!/usr/bin/env node
/**
 * Genera los dos secretos criptográficos que necesita StreamClick.
 *
 * Se usa `randomBytes` de Node (CSPRNG del sistema operativo). No sirve
 * `Math.random()`: es predecible y con él la firma del webhook dejaría de
 * proteger nada.
 *
 *   node scripts/generate-secrets.mjs
 */

import { randomBytes } from 'node:crypto';

const webhookSecret = randomBytes(32).toString('hex');
const encryptionKey = randomBytes(32).toString('hex');

console.log(`
Copia estos valores en las variables de entorno de Vercel.
NO los guardes en el repositorio ni los pegues en un chat.

  INBOUND_EMAIL_WEBHOOK_SECRET=${webhookSecret}

  CREDENTIALS_ENCRYPTION_KEY=${encryptionKey}

Notas importantes:

  · INBOUND_EMAIL_WEBHOOK_SECRET debe ser EL MISMO valor en Vercel y en el
    Email Worker de Cloudflare. Si difieren, todos los correos entrantes se
    rechazan con 401 y ningún código llega nunca.

  · CREDENTIALS_ENCRYPTION_KEY no se puede rotar sin más: al cambiarla, las
    contraseñas ya guardadas quedan ilegibles. Habría que descifrarlas con la
    clave antigua y volver a cifrarlas. Guárdala en un gestor de contraseñas
    antes de continuar.
`);
