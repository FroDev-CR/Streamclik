#!/usr/bin/env node
/**
 * Diagnóstico de la cadena de correo entrante.
 *
 * Recorre los siete eslabones que separan un correo de Netflix del código en
 * pantalla y dice **cuál** está roto. Existe porque el síntoma de casi todos los
 * fallos de esta cadena es idéntico —"no llega ningún código"— y sin diagnóstico
 * por partes se acaba revisando todo a ciegas.
 *
 *   node scripts/diagnostico-correo.mjs
 *   node scripts/diagnostico-correo.mjs https://streamclik.vercel.app
 *
 * El secreto se toma de INBOUND_EMAIL_WEBHOOK_SECRET. Sin él se ejecutan las
 * comprobaciones que no requieren firmar:
 *
 *   export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)
 */

import { createHmac } from 'node:crypto';
import { Resolver } from 'node:dns/promises';

const BASE = (process.argv[2] ?? 'https://streamclick.xyz').replace(/\/$/, '');
const DOMINIO = new URL(BASE).hostname;
const SECRETO = process.env.INBOUND_EMAIL_WEBHOOK_SECRET ?? null;
const BUZON = process.env.INBOX_EMAIL ?? `netflix1@${DOMINIO.replace(/^www\./, '')}`;

// Se usa un resolvedor con servidores públicos explícitos en lugar del DNS del
// sistema: muchos routers domésticos y VPN corporativas cachean o reescriben
// respuestas, y eso produce diagnósticos falsos justo cuando se está
// investigando un problema de DNS.
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

const VERDE = '[32m';
const ROJO = '[31m';
const AMBAR = '[33m';
const GRIS = '[90m';
const RESET = '[0m';
const NEGRITA = '[1m';

let fallos = 0;
let avisos = 0;

function ok(titulo, detalle) {
  console.log(`${VERDE}  ✔${RESET} ${titulo}`);
  if (detalle) console.log(`${GRIS}     ${detalle}${RESET}`);
}

function error(titulo, detalle, arreglo) {
  fallos += 1;
  console.log(`${ROJO}  ✖${RESET} ${NEGRITA}${titulo}${RESET}`);
  if (detalle) console.log(`${GRIS}     ${detalle}${RESET}`);
  if (arreglo) console.log(`${AMBAR}     → ${arreglo}${RESET}`);
}

function aviso(titulo, detalle) {
  avisos += 1;
  console.log(`${AMBAR}  !${RESET} ${titulo}`);
  if (detalle) console.log(`${GRIS}     ${detalle}${RESET}`);
}

function seccion(numero, titulo) {
  console.log(`\n${NEGRITA}${numero}. ${titulo}${RESET}`);
}

/** `fetch` con tiempo límite: un endpoint colgado no debe colgar el diagnóstico. */
async function pedir(url, opciones = {}, ms = 15000) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: control.signal, redirect: 'manual' });
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Detecta que quien respondió fue un proxy corporativo o un cortafuegos, no la
 * aplicación.
 *
 * Importa para no dar diagnósticos falsos: un 403 de un proxy en la prueba de
 * firma llegó a leerse como "se aceptó una petición sin firmar", que es una
 * alarma de seguridad grave y completamente equivocada. Una alarma falsa en una
 * herramienta de diagnóstico es peor que no tener la comprobación, porque manda
 * a revisar el sitio incorrecto.
 */
function pareceBloqueoDeRed(estado, cuerpo) {
  if (estado !== 403 && estado !== 407) return false;
  return /allowlist|egress|proxy|firewall|blocked|denied|not permitted/i.test(cuerpo);
}

// -----------------------------------------------------------------------------

console.log(`\n${NEGRITA}Diagnóstico de correo entrante — StreamClick${RESET}`);
console.log(`${GRIS}Aplicación: ${BASE}${RESET}`);
console.log(`${GRIS}Buzón de prueba: ${BUZON}${RESET}`);

// -----------------------------------------------------------------------------
seccion(1, 'DNS — ¿quién manda en el dominio?');
// -----------------------------------------------------------------------------
// Email Routing sólo funciona si Cloudflare es el DNS autoritativo. Es el
// requisito que más veces se pasa por alto porque la web puede estar
// perfectamente servida por Vercel mientras el correo no funciona en absoluto.

let cloudflareEsAutoritativo = false;

try {
  const ns = await resolver.resolveNs(DOMINIO);
  cloudflareEsAutoritativo = ns.some((s) => s.toLowerCase().includes('ns.cloudflare.com'));

  if (cloudflareEsAutoritativo) {
    ok('Cloudflare es el DNS autoritativo', ns.join(', '));
  } else {
    error(
      'El DNS no lo sirve Cloudflare',
      `Nameservers actuales: ${ns.join(', ')}`,
      'Email Routing exige que Cloudflare sea autoritativo. Cambia los nameservers en el registrador.',
    );
  }
} catch (e) {
  error('No se pudieron resolver los nameservers', e.message, `¿Está registrado ${DOMINIO}?`);
}

try {
  const a = await resolver.resolve4(DOMINIO);
  ok(`El dominio resuelve a ${a.join(', ')}`);
} catch {
  try {
    const cname = await resolver.resolveCname(DOMINIO);
    ok(`El dominio resuelve por CNAME a ${cname.join(', ')}`);
  } catch {
    error(
      'El dominio no resuelve a ninguna dirección',
      'Sin registro A ni CNAME, la web no carga.',
      'Añade el registro que indique Vercel en Settings → Domains.',
    );
  }
}

// -----------------------------------------------------------------------------
seccion(2, 'MX — ¿puede recibir correo?');
// -----------------------------------------------------------------------------
try {
  const mx = await resolver.resolveMx(DOMINIO);
  const deCloudflare = mx.filter((r) => r.exchange.toLowerCase().includes('mx.cloudflare.net'));

  if (deCloudflare.length > 0) {
    ok(
      'Email Routing de Cloudflare está activo',
      deCloudflare.map((r) => `${r.priority} ${r.exchange}`).join(' · '),
    );
  } else if (mx.length > 0) {
    error(
      'Hay MX, pero no son los de Cloudflare',
      mx.map((r) => `${r.priority} ${r.exchange}`).join(' · '),
      'Otro proveedor recibe el correo del dominio. Los códigos no llegarán al Worker.',
    );
  }
} catch {
  error(
    'El dominio no tiene registros MX',
    'Sin MX nadie acepta correo para este dominio: los mensajes rebotan en el emisor.',
    'Cloudflare → Email → Email Routing → Get started (los MX los añade solo).',
  );
}

// -----------------------------------------------------------------------------
seccion(3, 'Aplicación — ¿está viva?');
// -----------------------------------------------------------------------------
try {
  const r = await pedir(`${BASE}/api/health`);
  const cuerpo = await r.text();

  if (r.ok && cuerpo.includes('"status":"ok"')) {
    ok('La aplicación responde', cuerpo.slice(0, 120));
  } else if (pareceBloqueoDeRed(r.status, cuerpo)) {
    aviso(
      'No se pudo comprobar: hay un proxy o cortafuegos delante',
      'Ejecuta el diagnóstico desde una red sin restricciones de salida.',
    );
  } else {
    error(`/api/health devolvió ${r.status}`, cuerpo.slice(0, 200), '¿Terminó bien el despliegue?');
  }
} catch (e) {
  error('No se pudo contactar con la aplicación', e.message, `¿Es correcta la URL ${BASE}?`);
}

// -----------------------------------------------------------------------------
seccion(4, 'Webhook — ¿es alcanzable sin sesión?');
// -----------------------------------------------------------------------------
// La comprobación más valiosa del diagnóstico. El webhook DEBE quedar fuera del
// middleware de Clerk: no tiene sesión, se autentica con firma HMAC. Si Clerk lo
// intercepta, el Worker recibe una redirección al login en lugar de un 200 y
// ningún código llega jamás — sin que ningún test de la aplicación lo detecte.

const URL_WEBHOOK = `${BASE}/api/webhooks/inbound-email`;

try {
  const r = await pedir(URL_WEBHOOK);
  const cuerpo = await r.text();

  if (pareceBloqueoDeRed(r.status, cuerpo)) {
    aviso(
      'No se pudo comprobar: hay un proxy o cortafuegos delante',
      'Ejecuta el diagnóstico desde una red sin restricciones de salida.',
    );
  } else if (r.status >= 300 && r.status < 400) {
    error(
      `El webhook redirige (${r.status})`,
      `Location: ${r.headers.get('location') ?? '(sin cabecera)'}`,
      'El middleware de Clerk lo está interceptando. Revisa el matcher en src/middleware.ts: debe excluir api/webhooks.',
    );
  } else if (cuerpo.includes('"endpoint":"inbound-email"')) {
    ok('El webhook es público y responde', cuerpo.slice(0, 120));
  } else if (cuerpo.trimStart().startsWith('<')) {
    error(
      'El webhook devuelve HTML en vez de JSON',
      'Casi siempre es la pantalla de login de Clerk.',
      'Revisa el matcher del middleware.',
    );
  } else {
    aviso(`Respuesta inesperada (${r.status})`, cuerpo.slice(0, 200));
  }
} catch (e) {
  error('No se pudo contactar con el webhook', e.message);
}

// -----------------------------------------------------------------------------
seccion(5, 'Firma — ¿se rechaza lo no firmado?');
// -----------------------------------------------------------------------------
// Si esto no devuelve 401, cualquiera puede inyectar códigos falsos con un curl
// y hacer que un cliente introduzca un código controlado por un atacante.

try {
  const r = await pedir(URL_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: 'sonda-sin-firma', to: BUZON, from: 'x@y.com' }),
  });

  const cuerpo = await r.text();

  if (r.status === 401) {
    ok('Se rechaza el correo sin firma (401)');
  } else if (pareceBloqueoDeRed(r.status, cuerpo)) {
    // No es un fallo de la aplicación: la petición ni siquiera llegó.
    aviso(
      'No se pudo comprobar: hay un proxy o cortafuegos delante',
      `${r.status} · ${cuerpo.slice(0, 140)}`,
    );
  } else if (r.status >= 300 && r.status < 400) {
    error(`El POST redirige (${r.status})`, null, 'De nuevo el middleware: el webhook debe quedar fuera.');
  } else if (r.status >= 200 && r.status < 300) {
    // Sólo un 2xx significa de verdad que se aceptó sin firma.
    error(
      `¡Se aceptó una petición sin firmar! (${r.status})`,
      'Cualquiera podría inyectar códigos falsos.',
      '¿Está bien configurada INBOUND_EMAIL_WEBHOOK_SECRET en Vercel?',
    );
  } else {
    aviso(`Respuesta inesperada (${r.status})`, cuerpo.slice(0, 200));
  }
} catch (e) {
  error('Falló la prueba sin firma', e.message);
}

// -----------------------------------------------------------------------------
seccion(6, 'Ingesta — envío firmado de extremo a extremo');
// -----------------------------------------------------------------------------

if (!SECRETO) {
  aviso(
    'Omitido: falta INBOUND_EMAIL_WEBHOOK_SECRET',
    'export $(grep INBOUND_EMAIL_WEBHOOK_SECRET .env.local | xargs)',
  );
} else {
  const carga = {
    messageId: `diagnostico-${Date.now()}`,
    to: BUZON,
    from: '"Netflix" <info@account.netflix.com>',
    subject: 'Importante: cómo actualizar tu Hogar con Netflix',
    text: 'Tu código de acceso temporal es 4821. Caduca en 15 minutos.',
    html: null,
    receivedAt: new Date().toISOString(),
  };

  // Se firma exactamente la misma cadena que se envía. Serializar dos veces es
  // el error clásico: JSON.stringify no garantiza un resultado idéntico y la
  // firma dejaría de cuadrar de forma intermitente.
  const cuerpo = JSON.stringify(carga);
  const marca = String(Math.floor(Date.now() / 1000));
  const firma = createHmac('sha256', SECRETO).update(`${marca}.${cuerpo}`, 'utf8').digest('hex');

  try {
    const r = await pedir(URL_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-streamclick-timestamp': marca,
        'x-streamclick-signature': firma,
      },
      body: cuerpo,
    });

    const texto = await r.text();

    if (r.status === 401) {
      error(
        'Firma rechazada (401)',
        'El secreto local no coincide con el de Vercel.',
        'Compara INBOUND_EMAIL_WEBHOOK_SECRET en .env.local y en Vercel. Es el fallo más común.',
      );
    } else if (r.status === 500) {
      error(
        'Error del servidor (500)',
        texto.slice(0, 200),
        'Suele ser Supabase: revisa SUPABASE_SERVICE_ROLE_KEY en Vercel y los logs de la función.',
      );
    } else if (texto.includes('"created"')) {
      ok('Código creado y guardado', texto.slice(0, 160));
      console.log(
        `${GRIS}     El código 4821 debería aparecer AHORA en el dashboard, sin recargar.${RESET}`,
      );
    } else if (texto.includes('"ignored"')) {
      aviso(
        'Ingesta correcta, pero ninguna cuenta usa ese buzón',
        `Crea en /admin una cuenta con correo de ingesta ${BUZON}, o define INBOX_EMAIL con el que ya tengas.`,
      );
    } else if (texto.includes('"unparsed"')) {
      aviso('Correo guardado, sin código extraído', texto.slice(0, 160));
    } else if (texto.includes('"duplicate"')) {
      ok('Duplicado detectado: la idempotencia funciona', texto.slice(0, 160));
    } else {
      aviso(`Respuesta ${r.status}`, texto.slice(0, 200));
    }
  } catch (e) {
    error('Falló el envío firmado', e.message);
  }
}

// -----------------------------------------------------------------------------
seccion(7, 'Resumen');
// -----------------------------------------------------------------------------

if (fallos === 0 && avisos === 0) {
  console.log(`${VERDE}  Toda la cadena responde correctamente.${RESET}`);
  console.log(
    `${GRIS}  Queda la última milla: envía un correo real a ${BUZON} y compruébalo\n  con "npx wrangler tail" desde workers/inbound-email.${RESET}\n`,
  );
} else {
  console.log(
    `  ${fallos > 0 ? ROJO : VERDE}${fallos} fallo(s)${RESET} · ${AMBAR}${avisos} aviso(s)${RESET}`,
  );
  console.log(
    `${GRIS}  Resuelve los fallos de arriba abajo: cada eslabón depende del anterior.${RESET}\n`,
  );
}

process.exit(fallos > 0 ? 1 : 0);
