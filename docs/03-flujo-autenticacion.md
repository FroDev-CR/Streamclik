# Flujo de autenticación

## 1. Elección: Supabase Auth con cookies (`@supabase/ssr`)

Supabase Auth soporta dos modos de persistencia de sesión:

| Modo | Dónde vive el token | Problema |
| --- | --- | --- |
| `localStorage` (SDK clásico) | Navegador | Los Server Components **no pueden leerlo**. Todo el dashboard tendría que ser cliente. |
| **Cookies (`@supabase/ssr`)** | Cookie `httpOnly` | Servidor y navegador comparten sesión. |

Se elige cookies. Es lo que habilita el objetivo de "Server Components cuando
convenga": sin sesión en el servidor, no hay renderizado de datos privados en el
servidor. Ver ADR-0004.

## 2. Registro

```
Usuario → /register
   │  Server Action  signUpAction (validación zod en el servidor)
   ▼
supabase.auth.signUp({ email, password })
   │
   ├─ Supabase crea la fila en auth.users
   ├─ TRIGGER on_auth_user_created → INSERT en public.user_profiles (role='client')
   └─ Envía correo de confirmación con token_hash
   │
Usuario abre el enlace → GET /auth/confirm?token_hash=…&type=email
   │  verifyOtp() → escribe la cookie de sesión
   ▼
redirect(/dashboard)
```

El trigger de creación del perfil es `SECURITY DEFINER`: se ejecuta dentro de la
transacción de Auth, así que **nunca** existe un `auth.users` sin su
`user_profiles`. Hacerlo desde la aplicación después del signup dejaría usuarios
huérfanos cada vez que fallara la segunda llamada.

Todo usuario nuevo es `client`. Promover a `admin` es una operación deliberada de
base de datos. Un endpoint de "registrarse como admin" es una escalada de
privilegios esperando a ocurrir.

## 3. Inicio de sesión

```
/login → Server Action signInAction
   │
   ├─ zod valida el payload
   ├─ signInWithPassword()
   │     └─ error → se devuelve mensaje genérico ("Credenciales inválidas")
   │               para no revelar si el correo existe (enumeración de usuarios)
   └─ éxito → cookies de sesión (httpOnly, Secure, SameSite=Lax)
   │
revalidatePath('/', 'layout')   ← invalida el caché de Server Components
redirect('/dashboard')
```

`redirect()` de Next lanza una excepción `NEXT_REDIRECT` por diseño. Los bloques
`try/catch` alrededor de una Server Action deben re-lanzarla; capturarla y
tratarla como error es el bug más común con Server Actions y se manifiesta como
"el login no navega". El código lo maneja llamando a `redirect()` **fuera** del
`try`.

## 4. Middleware: refresco y guardias

`src/middleware.ts` corre en cada petición que casa con el matcher:

1. **Refresca el token.** Los access tokens de Supabase duran ~1 hora. Sin
   refresco en el middleware, un usuario con la pestaña abierta recibiría 401 al
   navegar. `supabase.auth.getUser()` refresca y reescribe la cookie.
2. **Protege rutas.** Sin sesión en `/dashboard` o `/admin` → redirect a `/login`
   con `?next=` para volver al destino tras autenticarse.
3. **Evita rutas de auth con sesión.** Con sesión en `/login` → redirect a
   `/dashboard`.

Detalle crítico de implementación: el objeto `NextResponse` debe crearse **antes**
de llamar a Supabase y devolverse **el mismo**, porque el SDK escribe las cookies
refrescadas sobre esa respuesta. Crear un `NextResponse` nuevo al final descarta
el token refrescado y produce el bug de "me desloguea cada hora", difícil de
reproducir en desarrollo.

Se usa `getUser()` y no `getSession()`: `getSession()` lee la cookie sin
verificar la firma contra el servidor de Auth, así que una cookie manipulada
pasaría. `getUser()` valida contra Supabase. En el middleware, la diferencia es
la frontera de seguridad.

## 5. Autorización (distinta de la autenticación)

La autenticación responde "¿quién eres?"; la autorización, "¿qué puedes ver?".
Se resuelven en capas distintas:

| Capa | Qué hace | Se puede saltar |
| --- | --- | --- |
| Middleware | Redirige a `/login` si no hay sesión | Sí (es UX) |
| Layout `(dashboard)` | `requireUser()` / `requireAdmin()` | Sí (defensa en profundidad) |
| **Políticas RLS** | Filtra filas en Postgres | **No** |

Solo la tercera es una garantía real. Si mañana un `SELECT` olvida su `WHERE
user_id = …`, RLS igual devuelve cero filas ajenas. Es la razón de que la
autorización se diseñe primero en SQL y después en TypeScript.

## 6. Cierre de sesión

Server Action `signOutAction` → `supabase.auth.signOut()` (revoca el refresh
token del lado del servidor, no solo borra la cookie) → `revalidatePath('/',
'layout')` → `redirect('/login')`.

Sin `revalidatePath`, Next podría servir desde caché el dashboard renderizado del
usuario anterior. Es una fuga de datos entre sesiones en dispositivos compartidos.
