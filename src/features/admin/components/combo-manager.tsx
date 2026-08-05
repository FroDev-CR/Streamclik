'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Layers3, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import {
  createComboAction,
  deleteComboAction,
  toggleComboAction,
  updateComboAction,
} from '../actions';
import type { AdminComboRow, AdminPlatformRow } from '../queries';

function CreateButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full disabled={pending}>
      {pending ? (
        'Guardando…'
      ) : (
        <>
          <Plus aria-hidden className="size-4" strokeWidth={3} />
          Crear combo
        </>
      )}
    </Button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Save aria-hidden className="size-3.5" strokeWidth={2.5} />
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  );
}

function ConfirmDeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="danger" disabled={pending}>
      <Trash2 aria-hidden className="size-3.5" strokeWidth={2.5} />
      {pending ? 'Borrando…' : 'Sí, borrar'}
    </Button>
  );
}

/**
 * Selector de aplicaciones con cantidad por aplicación.
 *
 * Lo comparten el alta y la edición para que las reglas del formulario (marcar
 * la casilla activa la fila, la cantidad va de 1 a 10) sean literalmente el
 * mismo código y no dos copias que se separan con el tiempo.
 */
function ServicePicker({
  platforms,
  prefix,
  selected,
  error,
}: {
  platforms: AdminPlatformRow[];
  prefix: string;
  selected?: Map<string, number>;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Perfiles incluidos</legend>
      {platforms.map((platform) => (
        <div
          key={platform.id}
          className="flex items-center gap-3 rounded-xl border-2 border-[var(--color-border)] px-3 py-2.5 transition-colors has-[input[type=checkbox]:checked]:bg-[var(--color-brand-yellow)]"
        >
          <input
            id={`${prefix}-service-${platform.id}`}
            type="checkbox"
            name="serviceIds"
            value={platform.id}
            defaultChecked={selected?.has(platform.id) ?? false}
            className="size-4 shrink-0 accent-black"
          />
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-black"
            style={{ backgroundColor: platform.brandColor }}
          />
          <label
            htmlFor={`${prefix}-service-${platform.id}`}
            className="min-w-0 flex-1 cursor-pointer text-sm font-semibold"
          >
            {platform.name}
          </label>
          {!platform.isActive && <Badge tone="neutral">Oculta</Badge>}
          <label
            htmlFor={`${prefix}-quantity-${platform.id}`}
            className="text-[0.65rem] font-extrabold uppercase tracking-wide text-[var(--color-content-muted)]"
          >
            Perfiles
          </label>
          <input
            id={`${prefix}-quantity-${platform.id}`}
            name={`serviceQuantity:${platform.id}`}
            type="number"
            min={1}
            max={10}
            step={1}
            defaultValue={selected?.get(platform.id) ?? 1}
            aria-label={`Cantidad de perfiles de ${platform.name}`}
            className="h-9 w-14 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-center text-sm font-bold"
          />
        </div>
      ))}
      {error && <p className="text-xs font-semibold text-[var(--color-danger)]">{error}</p>}
    </fieldset>
  );
}

function EditComboForm({
  combo,
  platforms,
  onCancel,
}: {
  combo: AdminComboRow;
  platforms: AdminPlatformRow[];
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateComboAction, {});
  const fieldId = (name: string) => `combo-${combo.id}-${name}`;
  const selected = new Map(combo.services.map((service) => [service.id, service.quantity]));

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 border-t-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)]/12 p-4"
    >
      <input type="hidden" name="comboId" value={combo.id} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-sm font-black uppercase">
            Editar combo
          </p>
          <p className="mt-1 text-xs text-[var(--color-content-muted)]">
            Identificador fijo: <span className="font-mono font-bold">{combo.slug}</span>. Es la
            dirección pública del combo y la clave de los pedidos ya hechos.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X aria-hidden className="size-3.5" strokeWidth={2.5} />
          Cerrar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId('name')}>Nombre</Label>
          <Input
            id={fieldId('name')}
            name="name"
            defaultValue={combo.name}
            error={state.fieldErrors?.name}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId('priceAmount')}>Precio mensual</Label>
          <Input
            id={fieldId('priceAmount')}
            name="priceAmount"
            type="number"
            min={0}
            step={100}
            defaultValue={combo.priceAmount}
            error={state.fieldErrors?.priceAmount}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('tagline')}>Frase del catálogo</Label>
          <Input
            id={fieldId('tagline')}
            name="tagline"
            defaultValue={combo.tagline ?? ''}
            maxLength={160}
            error={state.fieldErrors?.tagline}
          />
        </div>

        <div className="sm:col-span-2">
          <ServicePicker
            platforms={platforms}
            prefix={`edit-combo-${combo.id}`}
            selected={selected}
            error={state.fieldErrors?.serviceIds}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-xs font-bold text-[var(--color-success)]">
          {state.success}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <SaveButton />
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Borrado con confirmación en dos pasos.
 *
 * Un combo con pedidos no puede borrarse (clave foránea `on delete restrict`);
 * en ese caso la acción devuelve el motivo y se muestra aquí, junto a la
 * alternativa real, que es ocultarlo.
 */
function DeleteComboForm({ combo, onDone }: { combo: AdminComboRow; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteComboAction, {});

  return (
    <div className="flex flex-col gap-3 border-t-2 border-[var(--color-danger)] bg-[var(--color-danger)]/8 p-4">
      <p className="text-sm font-semibold">
        ¿Borrar «{combo.name}» para siempre? Desaparece del catálogo y no se puede deshacer.
      </p>

      {state.error && (
        <p role="alert" className="text-xs font-semibold text-[var(--color-danger)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="comboId" value={combo.id} />
          <ConfirmDeleteButton />
        </form>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ComboCard({ combo, platforms }: { combo: AdminComboRow; platforms: AdminPlatformRow[] }) {
  const [panel, setPanel] = useState<'none' | 'edit' | 'delete'>('none');

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-black uppercase leading-tight">
              {combo.name}
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--color-content-muted)]">
              {combo.slug} · ₡{combo.priceAmount.toLocaleString('es-CR')} / mes
            </p>
          </div>
          <Badge tone={combo.isActive ? 'success' : 'neutral'}>
            {combo.isActive ? 'Visible' : 'Oculto'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {combo.services.map((service) => (
            <span
              key={service.id}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--color-border)] px-3 py-1 text-xs font-semibold"
            >
              <i
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: service.brandColor }}
              />
              {service.name}
              {service.quantity > 1 && ` ×${service.quantity}`}
            </span>
          ))}
        </div>

        {combo.tagline && (
          <p className="text-sm text-[var(--color-content-muted)]">{combo.tagline}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPanel(panel === 'edit' ? 'none' : 'edit')}
          >
            <Pencil aria-hidden className="size-3.5" strokeWidth={2.5} />
            Editar
          </Button>

          <form action={toggleComboAction}>
            <input type="hidden" name="comboId" value={combo.id} />
            <input type="hidden" name="activar" value={String(!combo.isActive)} />
            <Button type="submit" size="sm" variant="secondary">
              {combo.isActive ? 'Ocultar del catálogo' : 'Mostrar en catálogo'}
            </Button>
          </form>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPanel(panel === 'delete' ? 'none' : 'delete')}
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={2.5} />
            Borrar
          </Button>
        </div>
      </div>

      {panel === 'edit' && (
        <EditComboForm combo={combo} platforms={platforms} onCancel={() => setPanel('none')} />
      )}
      {panel === 'delete' && <DeleteComboForm combo={combo} onDone={() => setPanel('none')} />}
    </Card>
  );
}

export function ComboManager({
  combos,
  platforms,
}: {
  combos: AdminComboRow[];
  platforms: AdminPlatformRow[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createComboAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <section
      id="combos"
      className="flex flex-col gap-5 border-t-2 border-[var(--color-border)] pt-8"
    >
      <header>
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--color-content-muted)]">
          <Layers3 aria-hidden className="size-4 text-[var(--color-accent)]" strokeWidth={2.5} />
          Configuración del catálogo
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black uppercase tracking-[-0.04em] sm:text-4xl">
          Combos
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-content-muted)]">
          Agrupa dos o más perfiles, aunque sean de la misma aplicación, define un único precio
          mensual y publícalo en la sección “¡Combos!” del catálogo.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Armar un combo</CardTitle>
          </CardHeader>
          <CardContent>
            <form ref={formRef} action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="combo-name">Nombre</Label>
                <Input
                  id="combo-name"
                  name="name"
                  placeholder="Maratón total"
                  error={state.fieldErrors?.name}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="combo-slug">Identificador</Label>
                <Input
                  id="combo-slug"
                  name="slug"
                  placeholder="maraton-total"
                  autoCapitalize="none"
                  spellCheck={false}
                  error={state.fieldErrors?.slug}
                  hint="Minúsculas, números y guiones. No se puede cambiar después."
                  required
                />
              </div>

              <ServicePicker
                platforms={platforms}
                prefix="combo"
                error={state.fieldErrors?.serviceIds}
              />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="combo-price">Precio mensual</Label>
                <Input
                  id="combo-price"
                  name="priceAmount"
                  type="number"
                  min={0}
                  step={100}
                  placeholder="7500"
                  error={state.fieldErrors?.priceAmount}
                  hint="Monto total del paquete en colones."
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="combo-tagline">Frase del catálogo</Label>
                <Input
                  id="combo-tagline"
                  name="tagline"
                  placeholder="Más historias, un solo pago y mejor precio."
                  maxLength={160}
                  error={state.fieldErrors?.tagline}
                />
              </div>

              {state.error && (
                <p
                  role="alert"
                  className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--color-danger)]"
                >
                  {state.error}
                </p>
              )}

              {state.success && (
                <p
                  role="status"
                  className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] px-3 py-2 text-sm font-semibold"
                >
                  {state.success}
                </p>
              )}

              <CreateButton />
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <h3 className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-wider text-[var(--color-content-muted)]">
            Combos creados ({combos.length})
          </h3>

          {combos.length === 0 && (
            <Card className="px-5 py-8 text-center text-sm text-[var(--color-content-muted)]">
              Todavía no hay combos. Crea el primero con el formulario.
            </Card>
          )}

          {combos.map((combo) => (
            <ComboCard key={combo.id} combo={combo} platforms={platforms} />
          ))}
        </div>
      </div>
    </section>
  );
}
