# ADR-0002 — Clean Architecture combinada con módulos verticales de UI

- **Estado:** Aceptada
- **Fecha:** 2026-07-31

## Contexto

Se pide "arquitectura limpia, escalable y modular" y "SOLID". El riesgo real de
aplicar Clean Architecture por el manual en un proyecto Next.js es doble: o se
crean cinco capas para un CRUD y nadie mantiene la disciplina, o se ignora la
estructura y `app/` acaba con la lógica de negocio dentro de los componentes.

## Decisión

Dos ejes de organización, cada uno con un propósito distinto:

1. **`src/core/` organizado por capa** — dominio, puertos y casos de uso. Aquí sí
   se aplica la regla de dependencia estrictamente: `core/` no importa Next ni
   Supabase. Es donde vive la lógica que debe ser testeable en aislamiento.

2. **`src/features/` organizado por módulo vertical** — `auth/`, `accounts/`,
   `pins/`, `admin/`. Cada uno contiene sus componentes, sus Server Actions y sus
   esquemas de validación. Es donde vive la UI.

`src/app/` queda reducido a routing: cada `page.tsx` resuelve la sesión, llama a
un caso de uso o a un repositorio de lectura, y compone componentes de `features/`.
Las páginas son delgadas por diseño.

## Por qué no una sola estructura

**Solo por capas** (`components/`, `services/`, `repositories/`): para tocar "el
visor de PIN" hay que abrir cuatro carpetas distintas. La cohesión de una función
de producto se pierde.

**Solo vertical** (`features/pins/{domain,infra,ui}`): duplica la infraestructura
en cada módulo. El cliente de Supabase, el tipo `Result` y el manejo de errores
acabarían copiados en `features/accounts` y `features/pins`, divergiendo.

La combinación asigna cada eje a lo que hace bien: capas para la lógica compartida
y estable, módulos verticales para la UI que cambia por función de producto.

## Reglas de importación

```
app/          → puede importar features/, core/use-cases, infrastructure/container
features/     → puede importar core/, components/ui, lib/
core/         → SOLO puede importar core/ (y zod)
infrastructure/ → puede importar core/ (implementa sus puertos)
```

La violación más probable en el futuro es que alguien importe
`infrastructure/supabase/server` desde `core/use-cases`. Chequeo mecánico en
revisión: `grep -r "@supabase\|next/" src/core/` debe salir vacío.

## Consecuencias

- Un caso de uso nuevo se prueba sin levantar Next ni Postgres.
- Coste: un caso de uso son ~40 líneas de las cuales unas 10 son cableado de
  dependencias. Se acepta para las operaciones de escritura; **las lecturas
  simples no pasan por casos de uso** (ver ADR-0006).
