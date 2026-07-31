# ADR-0006 — Las lecturas simples no pasan por casos de uso

- **Estado:** Aceptada
- **Fecha:** 2026-07-31

## Contexto

La aplicación estricta de Clean Architecture exigiría que *toda* lectura pasara por
un caso de uso que llama a un repositorio que mapea entidades de dominio. Para
"listar mis cuentas" eso son cuatro archivos y dos mapeos para producir exactamente
la misma lista que devuelve la consulta.

## Decisión

Dos caminos según si hay o no reglas de negocio:

**Escrituras y lecturas con lógica → caso de uso.**
`ProcessInboundEmailUseCase`, `AssignProfileUseCase`, `RevokeAssignmentUseCase`.
Aquí hay invariantes que proteger, orquestación entre repositorios y decisiones que
merecen tests unitarios.

**Lecturas de presentación → consulta directa desde el Server Component**, mediante
un módulo de queries tipado (`features/*/queries.ts`) que usa el cliente de
servidor con la sesión del usuario.

## Justificación

Un caso de uso de lectura que solo hace `return repo.findAll(userId)` no aporta
nada: no protege ninguna invariante, no orquesta nada y no tiene comportamiento que
testear. Es indirección pura, y la indirección sin propósito es el motivo por el
que "arquitectura limpia" tiene mala reputación en la práctica.

La pregunta de control es concreta: **¿tiene esta operación una regla que pueda
violarse?** Si la respuesta es no, un caso de uso solo añade un archivo que
mantener.

Además, en este proyecto hay un argumento específico y decisivo: **la autorización
de las lecturas ya vive en RLS** (ADR-0003). Un caso de uso de lectura no aporta
seguridad, porque la seguridad la aplica Postgres. Su único valor sería el mapeo a
entidades de dominio, y los Server Components renderizan filas, no entidades.

## Límite explícito

Si una consulta de presentación empieza a acumular condicionales de negocio ("si la
asignación vence en menos de 3 días, marcar como *por expirar*"), esa lógica se
promueve a `core/` como función de dominio pura y la query solo la invoca. La
señal de alarma es un `if` sobre reglas de negocio dentro de un `.tsx`.

## Consecuencias

- Menos archivos, y los casos de uso que existen tienen todos comportamiento real
  que merece tests.
- El acoplamiento a la sintaxis de PostgREST se extiende a `features/*/queries.ts`
  además de `infrastructure/repositories/`. Se acepta: son consultas de lectura,
  las más baratas de reescribir si algún día se migra de proveedor.
