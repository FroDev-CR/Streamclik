#!/usr/bin/env node
/**
 * Genera el par de claves VAPID de las notificaciones push.
 *
 * VAPID es lo que identifica a tu servidor ante Google, Apple o Mozilla cuando
 * les pides que entreguen un aviso. Se genera **una sola vez** y no se rota a la
 * ligera: al cambiarla, todas las suscripciones existentes dejan de valer y cada
 * navegador tiene que volver a pedir permiso.
 *
 * Ejecutar:
 *   node scripts/generar-claves-vapid.mjs
 *
 * La privada va a las variables de entorno del servidor y no se comparte con
 * nadie. La pública viaja al navegador por diseño: es la que se usa al
 * suscribirse.
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// Las claves VAPID se transportan en crudo, no en PEM: el punto público sin
// comprimir (65 bytes) y el escalar privado (32 bytes), ambos en base64url.
const jwkPublica = publicKey.export({ format: 'jwk' });
const jwkPrivada = privateKey.export({ format: 'jwk' });

const puntoPublico = Buffer.concat([
  Buffer.of(0x04),
  Buffer.from(jwkPublica.x, 'base64url'),
  Buffer.from(jwkPublica.y, 'base64url'),
]);

console.log(`
Claves VAPID generadas. Guárdalas y no las vuelvas a generar:
cambiarlas invalida todas las suscripciones y hay que volver a dar permiso
en cada dispositivo.

Añade estas tres líneas a .env.local y a las variables de Vercel
(Production y Preview):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${puntoPublico.toString('base64url')}
VAPID_PRIVATE_KEY=${jwkPrivada.d}
VAPID_SUBJECT=mailto:tu-correo@streamclick.xyz

La pública lleva el prefijo NEXT_PUBLIC_ a propósito: el navegador la necesita
para suscribirse. La privada NO debe salir del servidor.
`);
