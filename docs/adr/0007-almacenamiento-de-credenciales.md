# ADR-0007 — Almacenamiento de las credenciales de streaming

- **Estado:** Aceptada con deuda técnica reconocida
- **Fecha:** 2026-07-31

## Contexto

StreamClick guarda el usuario y la contraseña de cuentas reales de Netflix. A
diferencia de la contraseña de un usuario de la plataforma, **estas credenciales no
pueden hashearse**: el cliente necesita el valor original para iniciar sesión en
Netflix. Es un requisito del negocio, no una decisión de diseño.

Esto sitúa el problema en la categoría más incómoda: secretos reversibles en
reposo.

## Decisión para el MVP

1. Columna nombrada `login_password_enc` — el sufijo hace explícito el contrato de
   que nunca debe almacenar texto plano.
2. Cifrado en la capa de aplicación (AES-256-GCM) con una clave en variable de
   entorno, encapsulado tras el puerto `CredentialCipher`.
3. Acceso restringido por RLS: solo usuarios con asignación activa sobre un perfil
   de esa cuenta, y administradores.
4. `audit_logs` registra cada visualización de credenciales.
5. En la UI las credenciales se ocultan por defecto y requieren una acción
   explícita para revelarse.

## Lo que esto **no** resuelve

La clave de cifrado vive en la misma variable de entorno que la aplicación. Quien
comprometa el entorno de Vercel obtiene simultáneamente la clave y (con la
`service_role`) la base de datos. **El cifrado protege contra el volcado de la base
de datos, no contra el compromiso de la aplicación.**

Decirlo con claridad importa más que la mitigación en sí: la trampa real sería
llamar a esto "credenciales cifradas de forma segura" y que alguien asumiera
garantías que no existen.

## Ruta a producción (no incluida en el MVP)

1. **Supabase Vault / `pgsodium`** — cifrado gestionado en Postgres con la clave
   fuera de la tabla de datos y rotación soportada.
2. **KMS externo** (AWS KMS, GCP KMS) — la clave nunca reside en el entorno de la
   aplicación; el descifrado es una llamada auditada al servicio.
3. **Eliminar la necesidad** — la opción más fuerte a largo plazo: si el flujo del
   producto pasa a ser "el cliente solicita el código y StreamClick lo entrega" sin
   que el cliente maneje nunca la contraseña, deja de haber un secreto reversible
   que custodiar.

## Alternativa descartada

Guardar en texto plano y confiar únicamente en RLS. Se descarta: una copia de
seguridad filtrada, un log de consultas o un `SELECT *` de un integrante del equipo
expondrían decenas de credenciales reales de terceros de golpe. RLS protege el
acceso por la API, no el dato en reposo.

## Consecuencias

- El MVP puede desplegarse sin bloquearse en la infraestructura de gestión de
  claves.
- Queda registrado como el elemento de mayor riesgo del sistema y como primer
  candidato de endurecimiento antes de tener clientes reales.
- El puerto `CredentialCipher` permite sustituir la implementación por Vault o KMS
  sin tocar repositorios ni UI.
