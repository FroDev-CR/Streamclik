#!/usr/bin/env node
/**
 * Diagnóstico de la integración con GoPlay.
 *
 * Recorre los tres eslabones que separan una cuenta de Disney+ del código en
 * pantalla y dice cuál está roto:
 *
 *   1. iniciar sesión en GoPlay
 *   2. listar los perfiles (de ahí sale el `profile_id` de cada cuenta)
 *   3. consultar el correo de uno y extraer el código
 *
 * Existe por lo mismo que `diagnostico-correo.mjs`: el síntoma de casi todos los
 * fallos es el mismo —«no llega el código»— y sin partirlo por eslabones se
 * revisa todo a ciegas.
 *
 *   npm run diagnostico:goplay
 *   npm run diagnostico:goplay -- 2555382     # consulta un perfil concreto
 *
 * Lee las credenciales de `.env.local`. **No imprime la contraseña ni el token**,
 * sólo su forma y su longitud, para que la salida se pueda pegar en cualquier
 * sitio sin pensarlo dos veces.
 */

import { readFileSync } from 'node:fs';

const VERDE = '\x1b[32m';
const ROJO = '\x1b[31m';
const AMBAR = '\x1b[33m';
const GRIS = '\x1b[90m';
const RESET = '\x1b[0m';
const NEGRITA = '\x1b[1m';

const ok = (t, d) => console.log(`${VERDE}  ✔${RESET} ${t}${d ? `\n${GRIS}      ${d}${RESET}` : ''}`);
const mal = (t, d) => console.log(`${ROJO}  ✖${RESET} ${t}${d ? `\n${GRIS}      ${d}${RESET}` : ''}`);
const aviso = (t, d) => console.log(`${AMBAR}  !${RESET} ${t}${d ? `\n${GRIS}      ${d}${RESET}` : ''}`);
const detalle = (t) => console.log(`${GRIS}      ${t}${RESET}`);

function leerEnvLocal() {
  try {
    const crudo = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const vars = {};
    for (const linea of crudo.split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return vars;
  } catch {
    return {};
  }
}

const env = { ...leerEnvLocal(), ...process.env };
const BASE = (env.GOPLAY_BASE_URL ?? 'https://api.goplay.com.co').replace(/\/+$/, '');
const EMAIL = env.GOPLAY_EMAIL;
const PASSWORD = env.GOPLAY_PASSWORD;
const TOKEN_FIJO = env.GOPLAY_TOKEN;
const PERFIL_PEDIDO = process.argv[2] ?? null;

/**
 * Su backend lee `$_SERVER['HTTP_ORIGIN']` sin comprobar que exista. Una
 * petición sin `Origin` —cualquiera hecha fuera de un navegador— revienta con
 * «Undefined array key "HTTP_ORIGIN"» y contesta `success: false`, que es
 * indistinguible de una contraseña incorrecta. De ahí que vaya siempre.
 */
const ORIGEN = (env.GOPLAY_ORIGIN ?? 'https://mypantalla.goplay.com.co').replace(/\/+$/, '');
const CABECERAS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: ORIGEN,
  Referer: `${ORIGEN}/`,
};

async function json(ruta, opciones) {
  const respuesta = await fetch(`${BASE}${ruta}`, opciones);
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    /* se devuelve null y el llamador lo reporta */
  }
  return { status: respuesta.status, cuerpo, texto };
}

/** Dónde está el token dentro de la respuesta, sin revelar su valor. */
function ubicarToken(cuerpo) {
  const rutas = [
    ['token', cuerpo?.token],
    ['access_token', cuerpo?.access_token],
    ['data.token', cuerpo?.data?.token],
    ['data.access_token', cuerpo?.data?.access_token],
    ['profile.token', cuerpo?.profile?.token],
    ['user.token', cuerpo?.user?.token],
  ];

  for (const [ruta, valor] of rutas) {
    if (typeof valor === 'string' && valor.length >= 10) return { ruta, valor };
  }
  return null;
}

async function iniciarSesion() {
  if (TOKEN_FIJO) {
    ok('Se usa el GOPLAY_TOKEN de .env.local', `${TOKEN_FIJO.length} caracteres · no se intenta iniciar sesión`);
    return TOKEN_FIJO;
  }

  if (!EMAIL || !PASSWORD) {
    mal('Faltan GOPLAY_EMAIL y GOPLAY_PASSWORD en .env.local');
    return null;
  }

  const { status, cuerpo, texto } = await json('/api/login', {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (cuerpo === null) {
    mal(`El login devolvió ${status} y un cuerpo que no es JSON`, texto.slice(0, 160).replace(/\s+/g, ' '));
    return null;
  }

  detalle(`claves de la respuesta: ${Object.keys(cuerpo).join(', ')}`);

  // GoPlay responde 200 aunque falle: el éxito lo decide `success`.
  if (cuerpo.success === false) {
    const motivo = String(cuerpo.msg ?? cuerpo.message ?? '').trim() || 'sin detalle';
    mal('GoPlay rechazó el inicio de sesión', motivo);
    if (/HTTP_ORIGIN/i.test(motivo)) {
      detalle('Su backend exige la cabecera Origin. Ajustá GOPLAY_ORIGIN si tu panel vive en otro subdominio.');
    }
    return null;
  }

  if (cuerpo.profile?.active_g2fa === true || cuerpo.active_g2fa === true) {
    mal(
      'La cuenta tiene Google Authenticator activo',
      'El login automático no es posible. Desactivalo, o pegá un token vigente en GOPLAY_TOKEN.',
    );
    return null;
  }

  const hallado = ubicarToken(cuerpo);
  if (!hallado) {
    mal('El login no devolvió ningún token reconocible', `claves: ${Object.keys(cuerpo).join(', ')}`);
    return null;
  }

  ok(`Sesión iniciada · el token viene en ${NEGRITA}${hallado.ruta}${RESET}`, `${hallado.valor.length} caracteres`);
  ok('Google Authenticator desactivado', 'el login automático es viable');
  return hallado.valor;
}

async function listarPerfiles(auth) {
  const params = encodeURIComponent(JSON.stringify({ _paginate: { page: 1, max_rows: 50 }, _order: null }));
  const { status, cuerpo } = await json(`/api/v1/profiles?params=${params}`, { headers: auth });

  if (cuerpo?.success !== true || !Array.isArray(cuerpo.items)) {
    mal(`No se pudo listar los perfiles (HTTP ${status})`, String(cuerpo?.msg ?? '').trim());
    return null;
  }

  ok(`${cuerpo.items.length} perfil(es) en la cuenta`);
  for (const p of cuerpo.items) {
    const admite = p.check_emails ? 'consulta de correo disponible' : 'sin consulta de correo';
    detalle(`profile_id ${NEGRITA}${p.id}${RESET}${GRIS} · ${p.name_type_digital_account ?? '?'} · perfil ${p.screen_profile ?? '?'} · ${admite}`);
  }
  detalle('↑ ese profile_id es el que hay que guardar en StreamClick');

  return cuerpo.items;
}

async function consultarCodigo(auth, profileId) {
  const { status, cuerpo } = await json('/api/v1/profiles-check-emails', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ profile_id: profileId }),
  });

  detalle(`perfil ${profileId} · HTTP ${status} · claves: ${Object.keys(cuerpo ?? {}).join(', ')}`);

  if (cuerpo?.success !== true) {
    // Resultado normal cuando todavía no ha llegado ningún correo.
    aviso('Sin código por ahora', String(cuerpo?.msg ?? '').trim() || 'sin detalle');
    return 0;
  }

  let interno = null;
  try {
    // `response` es JSON serializado dentro de un string: se parsea dos veces.
    interno = JSON.parse(cuerpo.response);
  } catch {
    mal('El campo `response` no es JSON válido');
    return 1;
  }

  const items = Array.isArray(interno?.items) ? interno.items : [];
  ok(`${items.length} correo(s) en el buzón de la cuenta`);

  for (const item of items) {
    const texto = String(item.html ?? item.summary ?? '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&[a-z#0-9]+;/gi, ' ');
    const codigo = texto.match(/(?:^|\n)\s*(\d{6})\s*(?:$|\n)/)?.[1] ?? texto.match(/\b\d{6}\b/)?.[0] ?? null;

    detalle(`· ${item.sender ?? '?'} — ${String(item.subject ?? '').slice(0, 60)}`);
    if (codigo) ok(`   código extraído: ${NEGRITA}${codigo}${RESET}`);
    else aviso('   sin código en este correo');
  }

  return 0;
}

async function main() {
  console.log(`\n${NEGRITA}Diagnóstico de GoPlay${RESET} ${GRIS}· ${BASE}${RESET}\n`);

  console.log(`${NEGRITA}1 · Sesión${RESET}`);
  const token = await iniciarSesion();
  if (!token) return 1;

  const auth = { ...CABECERAS, Authorization: `Bearer ${token}` };

  console.log(`\n${NEGRITA}2 · Perfiles${RESET}`);
  const perfiles = await listarPerfiles(auth);
  if (!perfiles) return 1;

  console.log(`\n${NEGRITA}3 · Consulta del código${RESET}`);
  const objetivo = PERFIL_PEDIDO ?? perfiles[0]?.id ?? null;
  if (!objetivo) {
    aviso('No hay ningún perfil que consultar');
    return 0;
  }

  return consultarCodigo(auth, objetivo);
}

// `process.exit()` en Windows aborta con «Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)» cuando aún hay sockets cerrándose: un susto gratuito
// justo después de un diagnóstico que ya dio su respuesta. Se marca el código
// de salida y se deja que el proceso termine por su cuenta.
const fallos = await main().catch((error) => {
  mal('El diagnóstico se interrumpió', error instanceof Error ? error.message : String(error));
  return 1;
});

console.log(
  fallos === 0
    ? `\n${VERDE}Sin fallos.${RESET} ${GRIS}Si el paso 3 dice «sin código», pedí uno desde Disney y repetí.${RESET}\n`
    : `\n${ROJO}Diagnóstico detenido.${RESET} ${GRIS}Arreglá lo marcado con ✖ y volvé a correrlo.${RESET}\n`,
);

process.exitCode = fallos === 0 ? 0 : 1;
