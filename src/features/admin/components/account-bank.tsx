'use client';

import { useActionState, useMemo, useState } from 'react';
import { ChevronDown, Inbox, Search, Trash2, UserPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';
import { cn, formatDateTime } from '@/lib/utils';

import { assignProfileAction, deleteAccountAction, revokeAssignmentAction } from '../actions';
import type { AdminAccountRow, AdminClientOption, AdminProfileRow } from '../queries';

/**
 * Banco de cuentas: el inventario completo del operador.
 *
 * Es la vista principal del panel porque responde a la pregunta que el operador
 * se hace cada vez que entra: qué tengo y cuánto queda libre para vender. El
 * alta de cuentas vive en su propia página, ya que se usa una vez por compra y
 * ocupaba la mitad de la pantalla el resto del tiempo.
 */

function AssignForm({
  profileId,
  clients,
  state,
  formAction,
}: {
  profileId: string;
  clients: AdminClientOption[];
  state: ActionState;
  formAction: (formData: FormData) => void;
}) {
  if (clients.length === 0) {
    return (
      <p className="text-xs text-[var(--color-content-muted)]">
        No hay usuarios registrados todavía. Pide a tu cliente que cree su cuenta en{' '}
        <span className="font-mono">/registro</span>.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="accountProfileId" value={profileId} />

      {/* Los controles se apilan: en la rejilla de perfiles la ficha mide unos
          230 px y en horizontal el campo de fecha quedaba reducido a un icono. */}
      <Select name="userId" required aria-label="Cliente" className="h-9 text-xs" defaultValue="">
        <option value="" disabled>
          Cliente…
        </option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.fullName ? `${client.fullName} · ${client.email}` : client.email}
          </option>
        ))}
      </Select>

      <label className="flex flex-col gap-1">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-content-muted)]">
          Vence (opcional)
        </span>
        <input
          type="date"
          name="expiresAt"
          className="h-9 w-full rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
        />
      </label>

      <Button type="submit" size="sm" variant="accent" full>
        <UserPlus aria-hidden className="size-3.5" strokeWidth={3} />
        Asignar
      </Button>

      {state.error && (
        <span className="text-xs font-semibold text-[var(--color-danger)]">{state.error}</span>
      )}
    </form>
  );
}

function ProfileSlot({
  profile,
  clients,
  state,
  formAction,
}: {
  profile: AdminProfileRow;
  clients: AdminClientOption[];
  state: ActionState;
  formAction: (formData: FormData) => void;
}) {
  const asignado = profile.assignment !== null;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border-2 p-3',
        asignado
          ? 'border-[var(--color-border)] bg-[var(--color-canvas)]'
          : // El borde discontinuo comunica "hueco disponible" sin leer etiquetas.
            'border-dashed border-[var(--color-content-subtle)] bg-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase">
          {profile.profileLabel}
        </span>
        <Badge tone={asignado ? 'success' : 'neutral'}>{asignado ? 'Ocupado' : 'Libre'}</Badge>
      </div>

      {profile.assignment ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col">
            <span className="truncate text-xs font-semibold">{profile.assignment.userEmail}</span>
            <span className="text-xs text-[var(--color-content-muted)]">
              {profile.assignment.expiresAt
                ? `Hasta el ${formatDateTime(profile.assignment.expiresAt)}`
                : 'Sin vencimiento'}
            </span>
          </div>

          <form action={revokeAssignmentAction}>
            <input type="hidden" name="assignmentId" value={profile.assignment.id} />
            <Button type="submit" size="sm" variant="secondary" full>
              Liberar
            </Button>
          </form>
        </div>
      ) : (
        <AssignForm
          profileId={profile.profileId}
          clients={clients}
          state={state}
          formAction={formAction}
        />
      )}
    </li>
  );
}

/**
 * Borrado con confirmación en dos pasos.
 *
 * No se usa `confirm()` del navegador: algunos contextos lo bloquean y, sobre
 * todo, no puede decir **cuántos clientes** pierden el acceso. Un borrado
 * irreversible tiene que enseñar sus consecuencias antes de ejecutarse, no
 * después.
 */
function ConfirmDelete({ account, onCancel }: { account: AdminAccountRow; onCancel: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteAccountAction, {});
  const ocupados = account.profiles.filter((p) => p.assignment !== null).length;

  return (
    <div className="flex flex-col gap-2.5 border-b-2 border-[var(--color-border)] bg-[var(--color-danger)]/8 p-4">
      <p className="font-[family-name:var(--font-display)] text-sm font-black uppercase text-[var(--color-danger)]">
        ¿Eliminar «{account.label}»?
      </p>

      <p className="text-xs leading-relaxed text-[var(--color-content-muted)]">
        Se borran sus {account.profiles.length} perfiles y todo el historial de códigos.
        {ocupados > 0 && (
          <>
            {' '}
            <strong className="text-[var(--color-content)]">
              {ocupados} {ocupados === 1 ? 'cliente pierde' : 'clientes pierden'} el acceso ahora
              mismo.
            </strong>
          </>
        )}{' '}
        No se puede deshacer.
      </p>

      {state.error && (
        <p className="text-xs font-semibold text-[var(--color-danger)]">{state.error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="accountId" value={account.id} />
          <Button type="submit" size="sm" variant="danger">
            Sí, eliminar
          </Button>
        </form>

        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function AccountBank({
  accounts,
  clients,
}: {
  accounts: AdminAccountRow[];
  clients: AdminClientOption[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(assignProfileAction, {});
  const [busqueda, setBusqueda] = useState('');
  const [plataforma, setPlataforma] = useState('');

  // Las plataformas del filtro salen del propio inventario, no de una lista
  // fija: así aparecen solas al añadir un servicio nuevo y nunca se ofrece
  // filtrar por algo de lo que no hay ni una cuenta.
  const plataformas = useMemo(
    () => [...new Set(accounts.map((cuenta) => cuenta.serviceName))].sort(),
    [accounts],
  );

  // El filtro es en cliente porque el banco cabe entero en memoria: son decenas
  // de cuentas, no miles. Ir al servidor por cada tecla sólo añadiría latencia.
  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    const porPlataforma = plataforma
      ? accounts.filter((cuenta) => cuenta.serviceName === plataforma)
      : accounts;

    if (!termino) return porPlataforma;

    return porPlataforma.filter(
      (cuenta) =>
        cuenta.label.toLowerCase().includes(termino) ||
        cuenta.inboxEmail.toLowerCase().includes(termino) ||
        cuenta.serviceName.toLowerCase().includes(termino),
    );
  }, [accounts, busqueda, plataforma]);

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <Inbox aria-hidden className="size-8" strokeWidth={2} />
          <p className="font-[family-name:var(--font-display)] text-base font-extrabold uppercase">
            El banco está vacío
          </p>
          <p className="max-w-xs text-sm text-[var(--color-content-muted)]">
            Añade tu primera cuenta y sus perfiles se generarán solos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* El buscador aparece sólo cuando hay bastantes cuentas: con tres, un
          campo de búsqueda es ruido que ocupa sitio. */}
      {(accounts.length > 3 || plataformas.length > 1) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-content-muted)]"
              strokeWidth={2.5}
            />
            <Input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o buzón…"
              aria-label="Buscar cuentas"
              className="pl-9"
            />
          </div>

          {plataformas.length > 1 && (
            <div className="sm:w-52">
              <Select
                value={plataforma}
                onChange={(e) => setPlataforma(e.target.value)}
                aria-label="Filtrar por plataforma"
              >
                <option value="">Todas las plataformas</option>
                {plataformas.map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {visibles.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--color-content-muted)]">
          Ninguna cuenta coincide con los filtros aplicados.
        </p>
      )}

      {visibles.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          clients={clients}
          state={state}
          formAction={formAction}
        />
      ))}
    </div>
  );
}

/**
 * Tarjeta de una cuenta del banco, plegable.
 *
 * Los perfiles se ocultan hasta tocar la cabecera. Con cinco perfiles por cuenta
 * y varias cuentas, la lista completa ocupaba pantallas enteras de scroll para
 * responder a una pregunta que se contesta con el contador de ocupación: cuánto
 * queda libre. Al desplegar aparece el detalle.
 *
 * Se implementa con un `<button>` real y `aria-expanded`/`aria-controls` en vez
 * de con un `div` con `onClick`: así funciona con teclado y los lectores de
 * pantalla anuncian que la sección se abre y se cierra.
 */
function AccountCard({
  account,
  clients,
  state,
  formAction,
}: {
  account: AdminAccountRow;
  clients: AdminClientOption[];
  state: ActionState;
  formAction: (formData: FormData) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [abierta, setAbierta] = useState(false);

  const ocupados = account.profiles.filter((p) => p.assignment !== null).length;
  const total = account.profiles.length;
  const lleno = ocupados === total && total > 0;

  const idPanel = `perfiles-${account.id}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        {/* El botón ocupa el nombre y la marca, no la fila entera: las insignias
            y la papelera quedan fuera para que un toque cerca del borrado no
            despliegue la cuenta por accidente. */}
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-controls={idPanel}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] font-[family-name:var(--font-display)] text-lg font-black text-white"
            style={{ backgroundColor: account.brandColor }}
          >
            {account.serviceName.charAt(0)}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
              {account.label}
            </span>
            <span className="block truncate text-xs text-[var(--color-content-muted)]">
              {account.serviceName} · {ocupados} de {total} ocupados
            </span>
          </span>

          <ChevronDown
            aria-hidden
            className={cn(
              'size-5 shrink-0 transition-transform duration-150',
              abierta && 'rotate-180',
            )}
            strokeWidth={2.5}
          />
        </button>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Badge tone={lleno ? 'accent' : 'neutral'}>
            {ocupados}/{total}
          </Badge>
          <Badge tone={account.status === 'active' ? 'success' : 'warning'}>
            {account.status === 'active' ? 'Activa' : account.status}
          </Badge>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmando(true)}
            aria-label={`Eliminar la cuenta ${account.label}`}
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      {confirmando && <ConfirmDelete account={account} onCancel={() => setConfirmando(false)} />}

      {abierta && (
        <div id={idPanel} className="border-t-2 border-[var(--color-border)]">
          {/* Los datos de la cuenta van dentro del desplegable, no en la
              cabecera: son dos direcciones distintas y confundirlas es lo que
              hace que los códigos no lleguen. El buzón de ingesta es donde
              escribe la plataforma; el correo de acceso es el que usa el
              cliente para entrar. */}
          <dl className="grid gap-3 border-b-2 border-[var(--color-border)] bg-[var(--color-canvas)] p-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-content-subtle)]">
                Buzón de códigos
              </dt>
              <dd className="truncate font-mono text-xs">{account.inboxEmail}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-content-subtle)]">
                Correo de acceso
              </dt>
              <dd className="truncate font-mono text-xs">{account.loginEmail}</dd>
            </div>
          </dl>

          <CardContent className="p-4">
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {account.profiles.map((profile) => (
                <ProfileSlot
                  key={profile.profileId}
                  profile={profile}
                  clients={clients}
                  state={state}
                  formAction={formAction}
                />
              ))}
            </ul>
          </CardContent>
        </div>
      )}
    </Card>
  );
}
