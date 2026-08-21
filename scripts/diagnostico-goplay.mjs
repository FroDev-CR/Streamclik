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
 * sólo su forma, para que la salida se pueda pegar en cualquier sitio sin
 * pensarlo dos veces.
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

console.log(`\n${NEGRITA}Diagnóstico de GoPlay${RESET} ${GRIS}· ${BASE}${RESET}\n`);

async function json(ruta, opciones) {
  const respuesta = await fetch(`${BASE}${ruta}`, opciones);
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    /* se devuelve como null y el llamador lo reporta */
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

let token = TOKEN_FIJO ?? null;
let fallos = 0;

// --- 1 · Sesión --------------------------------------------------------------
console.log(`${NEGRITA}1 · Sesión${RESET}`);

if (token) {
  ok('Se usa el GOPLAY_TOKEN de .env.local', `${token.length} caracteres · no se intenta iniciar sesión`);
} else if (!EMAIL || !PASSWORD) {
  mal('Faltan GOPLAY_EMAIL y GOPLAY_PASSWORD en .env.local');
  process.exit(1);
} else {
  const { status, cuerpo, texto } = await json('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (cuerpo === null) {
    mal(`El login devolvió ${status} y un cuerpo que no es JSON`, texto.slice(0, 160).replace(/\s+/g, ' '));
    process.exit(1);
  }

  console.log(`${GRIS}      claves de la respuesta: ${Object.keys(cuerpo).join(', ')}${RESET}`);

  // GoPlay responde 200 aunque falle: el éxito lo decide `success`.
  if (cuerpo.success === false) {
    mal('GoPlay rechazó el inicio de sesión', String(cuerpo.msg ?? cuerpo.message ?? '').trim() || 'sin detalle');
    process.exit(1);
  }

  const g2fa = cuerpo.profile?.active_g2fa === true || cuerpo.active_g2fa === true;
  if (g2fa) {
    mal(
      'La cuenta tiene Google Authenticator activo',
      'El login automático no es posible. Desactivalo, o pegá un token vigente en GOPLAY_TOKEN.',
    );
    process.exit(1);
  }

  const hallado = ubicarToken(cuerpo);
  if (!hallado) {
    mal('El login no devolvió ningún token reconocible', `claves: ${Object.keys(cuerpo).join(', ')}`);
    process.exit(1);
  }

  token = hallado.valor;
  ok(`Sesión iniciada · el token viene en ${NEGRITA}${hallado.ruta}${RESET}`, `${token.length} caracteres`);
  ok('Google Authenticator desactivado', 'el login automático es viable');
}

const auth = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// --- 2 · Perfiles ------------------------------------------------------------
console.log(`\n${NEGRITA}2 · Perfiles${RESET}`);

const params = encodeURIComponent(JSON.stringify({ _paginate: { page: 1, max_rows: 50 }, _order: null }));
const listado = await json(`/api/v1/profiles?params=${params}`, { headers: auth });

let perfiles = [];
if (listado.cuerpo?.success !== true || !Array.isArray(listado.cuerpo.items)) {
  mal(`No se pudo listar los perfiles (HTTP ${listado.status})`, String(listado.cuerpo?.msg ?? '').trim());
  fallos += 1;
} else {
  perfiles = listado.cuerpo.items;
  ok(`${perfiles.length} perfil(es) en la cuenta`);
  for (const p of perfiles) {
    const admite = p.check_emails ? 'consulta de correo disponible' : 'sin consulta de correo';
    console.log(
      `${GRIS}      profile_id ${NEGRITA}${p.id}${RESET}${GRIS} · ${p.name_type_digital_account ?? '?'} · ${admite}${RESET}`,
    );
  }
  console.log(`${GRIS}      ↑ ese profile_id es el que hay que guardar en StreamClick${RESET}`);
}

// --- 3 · Consulta del código -------------------------------------------------
console.log(`\n${NEGRITA}3 · Consulta del código${RESET}`);

const objetivo = PERFIL_PEDIDO ?? perfiles[0]?.id ?? null;

if (!objetivo) {
  aviso('No hay ningún perfil que consultar');
} else {
  const consulta = await json('/api/v1/profiles-check-emails', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ profile_id: objetivo }),
  });

  console.log(`${GRIS}      perfil ${objetivo} · HTTP ${consulta.status} · claves: ${Object.keys(consulta.cuerpo ?? {}).join(', ')}${RESET}`);

  if (consulta.cuerpo?.success !== true) {
    // Es el resultado normal cuando todavía no ha llegado ningún correo.
    aviso('Sin código por ahora', String(consulta.cuerpo?.msg ?? '').trim() || 'sin detalle');
  } else {
    let interno = null;
    try {
      // `response` es JSON serializado dentro de un string: se parsea dos veces.
      interno = JSON.parse(consulta.cuerpo.response);
    } catch {
      mal('El campo `response` no es JSON válido');
      fallos += 1;
    }

    const items = Array.isArray(interno?.items) ? interno.items : [];
    ok(`${items.length} correo(s) en el buzón de la cuenta`);

    for (const item of items) {
      const texto = String(item.html ?? item.summary ?? '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&[a-z#0-9]+;/gi, ' ');
      const codigo = texto.match(/(?:^|\n)\s*(\d{6})\s*(?:$|\n)/)?.[1] ?? texto.match(/\b\d{6}\b/)?.[0] ?? null;

      console.log(
        `${GRIS}      · ${item.sender ?? '?'} — ${String(item.subject ?? '').slice(0, 60)}${RESET}`,
      );
      if (codigo) ok(`   código extraído: ${NEGRITA}${codigo}${RESET}`);
      else aviso('   sin código en este correo');
    }
  }
}

console.log(
  fallos === 0
    ? `\n${VERDE}Sin fallos.${RESET} ${GRIS}Si el paso 3 dice «sin código», pedí uno desde Disney y repetí.${RESET}\n`
    : `\n${ROJO}${fallos} fallo(s).${RESET}\n`,
);
