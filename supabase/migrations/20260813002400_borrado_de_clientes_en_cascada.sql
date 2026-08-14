-- =============================================================================
-- 0025 · Desbloquear el borrado de clientes
-- =============================================================================
-- Síntoma: borrar un cliente fallaba siempre con
--
--   23503: update or delete on table "profile_assignments" violates foreign key
--   constraint "order_assignments_assignment_id_fkey" on table "order_assignments"
--
-- La cadena de borrado es:
--
--   user_profiles → profile_assignments (cascade) → ✋ order_assignments
--
-- `order_assignments.assignment_id` se declaró `on delete restrict` en la
-- migración 0013. Tenía sentido para lo que protegía entonces: impedir que
-- alguien borrara una asignación suelta y dejara un pedido entregado apuntando
-- al vacío. Pero como efecto colateral bloquea el borrado del cliente entero,
-- que es una operación deliberada y con confirmación.
--
-- Pasa a `cascade`. Al borrar un cliente desaparece su historial completo
-- —pedidos, asignaciones y la relación entre ambos—, que es exactamente lo que
-- la pantalla advierte antes de confirmar. La protección contra el borrado
-- accidental de una asignación suelta sigue existiendo donde importa: la
-- aplicación nunca borra `profile_assignments` directamente, las revoca.
-- =============================================================================

alter table public.order_assignments
  drop constraint if exists order_assignments_assignment_id_fkey;

alter table public.order_assignments
  add constraint order_assignments_assignment_id_fkey
  foreign key (assignment_id)
  references public.profile_assignments (id)
  on delete cascade;

-- Las otras dos claves que apuntan a `profile_assignments` se comprobaron y ya
-- estaban bien, así que no se tocan:
--
--   · `orders.assignment_id`                    → on delete set null (0011)
--   · `profile_rewards.claimed_assignment_id`   → on delete set null (0014)
--
-- Se dejan anotadas porque si alguna volviera a `restrict`, el borrado fallaría
-- con este mismo error y otro nombre de restricción, y el síntoma sería
-- idéntico: un botón que no hace nada.
