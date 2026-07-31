# ADR-0003 — Row Level Security como única frontera real de autorización

- **Estado:** Aceptada
- **Fecha:** 2026-07-31

## Contexto

Un cliente debe ver **exclusivamente** los PIN de las cuentas que tiene asignadas.
Si esta regla falla, un cliente ve los códigos de otro, entra en su perfil y el
producto pierde su razón de existir. Es el requisito de seguridad número uno.

La autorización puede implementarse en tres sitios: la UI, la capa de aplicación o
la base de datos.

## Decisión

**Las tres, pero solo la base de datos es la garantía.** La UI y los casos de uso
son defensa en profundidad y ergonomía; RLS es la frontera.

### Por qué no basta con filtrar en la aplicación

Un `WHERE user_id = $1` en el repositorio protege únicamente ese camino de código.
Se salta por al menos cuatro vías:

1. Un `SELECT` nuevo escrito dentro de seis meses que olvida el `WHERE`.
2. La suscripción de Realtime, que no pasa por el repositorio en absoluto.
3. Un `fetch` directo a la API PostgREST de Supabase con el JWT del usuario —
   totalmente posible, el `anon key` y la URL son públicos por diseño.
4. Un parámetro `accountId` manipulado en una Server Action.

RLS cierra los cuatro a la vez, porque se aplica en el motor, después de que la
consulta haya sido escrita, venga de donde venga.

### Diseño concreto

```sql
CREATE POLICY "clientes ven PIN de sus cuentas asignadas"
  ON public.verification_pins FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profile_assignments pa
      JOIN public.account_profiles ap ON ap.id = pa.account_profile_id
      WHERE ap.account_id = verification_pins.account_id
        AND pa.user_id    = auth.uid()
        AND pa.status     = 'active'
        AND verification_pins.received_at >= pa.starts_at
        AND (pa.expires_at IS NULL OR verification_pins.received_at <= pa.expires_at)
    )
  );
```

La condición sobre `received_at` es la parte que se olvida y la que más importa
para la privacidad: sin ella, un cliente que hoy contrata el perfil 3 vería todo
el historial de PIN del inquilino anterior.

### Recursión de RLS

Las políticas que necesitan consultar otras tablas protegidas usan funciones
`SECURITY DEFINER` (`is_admin`, `has_account_access`) con `SET search_path =
public, pg_temp`. Sin esto se produce recursión infinita entre políticas, y sin el
`search_path` fijado, `SECURITY DEFINER` es un vector de escalada de privilegios
clásico.

Nadie con rol `authenticated` tiene `INSERT` sobre `verification_pins`. Solo la
`service_role` desde el webhook. Un cliente no puede fabricarse un PIN.

## Consecuencias

- La seguridad sobrevive a refactors de la capa de aplicación.
- Coste de rendimiento: cada `SELECT` sobre `verification_pins` evalúa un `EXISTS`
  con dos joins. Mitigado con índices en `profile_assignments (user_id) WHERE
  status='active'` y `account_profiles (account_id)`.
- Depurar "no veo mis datos" requiere mirar políticas, no solo código. Se mitiga
  con la matriz de acceso documentada en `02-esquema-base-de-datos.md`.
