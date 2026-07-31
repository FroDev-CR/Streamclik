# ADR-0005 — Server Actions para el usuario, Route Handlers para las máquinas

- **Estado:** Aceptada
- **Fecha:** 2026-07-31

## Contexto

Next.js 15 ofrece dos formas de ejecutar código de servidor ante una mutación:
Server Actions y Route Handlers. Usar ambas sin criterio produce una API a medias,
duplicada y con dos modelos de seguridad distintos.

## Decisión

El criterio es **quién es el cliente**:

| Consumidor | Mecanismo | Ejemplos |
| --- | --- | --- |
| Un navegador con sesión de StreamClick | **Server Action** | login, registro, crear cuenta, asignar perfil, revocar |
| Un sistema externo sin sesión | **Route Handler** | webhook de correo entrante, `/api/health` |

### Por qué Server Actions para el usuario

- **Protección CSRF automática** de Next (verificación de Origin). Un Route Handler
  `POST /api/accounts` la requiere manualmente y es fácil olvidarla.
- **Sin capa de API que mantener.** No hay que definir rutas, tipos de request ni
  cliente fetch: el formulario invoca la función tipada de extremo a extremo.
- **`revalidatePath` en el mismo lugar de la mutación.** La invalidación de caché
  vive junto al cambio que la provoca, en vez de en un `router.refresh()` del
  cliente que alguien olvidará.
- **Funcionan sin JavaScript** cuando se usan como `action` de un `<form>`.

### Por qué Route Handler para el webhook

Un proveedor de correo no puede enviar una Server Action: necesita un endpoint
HTTP estable, versionable y con su propio esquema de autenticación (firma HMAC en
vez de cookie de sesión). Además necesita control explícito de códigos de estado —
la diferencia entre responder 200 y 500 determina si el proveedor reintenta.

## Reglas que acompañan a la decisión

1. **Toda Server Action revalida su propia entrada de sesión.** Una Server Action es
   un endpoint POST público; que solo se invoque desde un componente protegido no
   la protege. Empiezan siempre con `requireUser()` o `requireAdmin()`.
2. **Toda entrada se valida con zod dentro de la acción.** El `FormData` es
   arbitrario, incluido el `accountId` de un campo oculto.
3. **Devuelven `ActionState`, no lanzan.** Los errores esperables (validación,
   credenciales) son datos que el formulario renderiza; solo lo inesperado lanza.
4. **`redirect()` se llama fuera del `try`.** Lanza `NEXT_REDIRECT` por diseño y un
   `catch` lo tragaría, dejando el formulario sin navegar y sin error visible.

## Consecuencias

- Superficie de API pública mínima: un webhook y un health check.
- Menos código de cliente: no hay capa de fetching para las mutaciones.
- Si en el futuro hace falta una app móvil nativa, necesitará una API REST propia.
  Se acepta: los casos de uso ya están aislados en `core/`, así que esa API sería
  una capa de presentación adicional, no una reescritura.
