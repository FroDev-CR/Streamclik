#!/usr/bin/env node
/**
 * Firma un payload de prueba para el webhook de correo entrante.
 *
 * Permite ejercitar el pipeline completo en local sin contratar un proveedor de
 * correo ni esperar a que Netflix envíe un código real.
 *
 * Uso:
 *   node scripts/sign-payload.mjs tests/fixtures/netflix-household.json
 *
 * Imprime el comando curl listo para copiar.
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [, , filePath] = process.argv;

if (!filePath) {
  console.error('Uso: node scripts/sign-payload.mjs <ruta-al-json>');
  process.exit(1);
}

const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

if (!secret) {
  console.error(
    'Falta INBOUND_EMAIL_WEBHOOK_SECRET.\n' +
      'Cárgalo desde .env.local:  export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)',
  );
  process.exit(1);
}

// El cuerpo se lee tal cual del disco, sin volver a serializarlo: el endpoint
// verifica la firma sobre los bytes exactos que recibe, y un JSON.stringify
// intermedio cambiaría el espaciado y rompería la comprobación.
const rawBody = readFileSync(filePath, 'utf8');
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');

const url = process.env.WEBHOOK_URL ?? 'http://localhost:3000/api/webhooks/inbound-email';

console.log(`curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "x-streamclick-timestamp: ${timestamp}" \\
  -H "x-streamclick-signature: ${signature}" \\
  --data-binary @${filePath}`);
