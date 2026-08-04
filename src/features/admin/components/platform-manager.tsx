'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Pencil, Plus, Save, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_ICON_OPTIONS } from '@/features/catalog/platform-icons';
import type { ActionState } from '@/features/shared/action-state';

import { createPlatformAction, togglePlatformAction, updatePlatformAction } from '../actions';
import type { AdminPlatformRow } from '../queries';

function BotonCrear() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" full disabled={pending}>
      {pending ? (
        'Creando…'
      ) : (
        <>
          <Plus aria-hidden className="size-4" strokeWidth={3} />
          Añadir plataforma
        </>
      )}
    </Button>
  );
}

function BotonGuardar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Save aria-hidden className="size-3.5" strokeWidth={2.5} />
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  );
}

function IconPicker({
  defaultValue = 'generic',
  error,
  prefix,
}: {
  defaultValue?: string;
  error?: string;
  prefix: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-[family-name:var(--font-display)] text-[0.72rem] font-extrabold uppercase tracking-wider">
        Icono de la aplicación
      </legend>
      <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-auto rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] p-2 sm:grid-cols-6">
        {PLATFORM_ICON_OPTIONS.map((option) => (
          <label key={option.key} className="cursor-pointer" title={option.label}>
            <input
              type="radio"
              name="iconKey"
              value={option.key}
              defaultChecked={option.key === defaultValue}
              className="peer sr-only"
              required
            />
            <span className="flex aspect-square items-center justify-center rounded-xl border-2 border-transparent bg-[var(--color-surface)] p-2 transition peer-checked:border-[var(--color-accent)] peer-checked:shadow-[3px_3px_0_var(--color-border)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
              <PlatformIcon iconKey={option.key} name={option.label} className="size-7" />
              <span className="sr-only">{option.label}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-[var(--color-content-muted)]" id={`${prefix}-icon-hint`}>
        Incluye Netflix, Disney+, Max, Prime Video, Paramount+, Apple TV+, Crunchyroll, IPTV y más.
      </p>
      {error && <p className="text-xs font-semibold text-[var(--color-danger)]">{error}</p>}
    </fieldset>
  );
}

function EditPlatformForm({
  platform,
  onCancel,
}: {
  platform: AdminPlatformRow;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updatePlatformAction, {});
  const fieldId = (name: string) => `platform-${platform.id}-${name}`;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 border-t-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)]/12 p-4"
    >
      <input type="hidden" name="serviceId" value={platform.id} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-sm font-black uppercase">
            Editar plataforma
          </p>
          <p className="mt-1 text-xs text-[var(--color-content-muted)]">
            Identificador fijo: <span className="font-mono font-bold">{platform.slug}</span>. Así se
            conserva el lector automático de correos.
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
            defaultValue={platform.name}
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
            defaultValue={platform.priceAmount}
            error={state.fieldErrors?.priceAmount}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId('brandColor')}>Color de marca</Label>
          <div className="flex items-center gap-2">
            <input
              id={fieldId('brandColor')}
              name="brandColor"
              type="color"
              defaultValue={platform.brandColor}
              aria-label={`Color de ${platform.name}`}
              className="h-11 w-16 shrink-0 cursor-pointer rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-1"
            />
            <span className="font-mono text-xs text-[var(--color-content-muted)]">
              {platform.brandColor.toUpperCase()}
            </span>
          </div>
          {state.fieldErrors?.brandColor && (
            <p className="text-xs font-semibold text-[var(--color-danger)]">
              {state.fieldErrors.brandColor}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId('tagline')}>Frase del catálogo</Label>
          <Input
            id={fieldId('tagline')}
            name="tagline"
            defaultValue={platform.tagline ?? ''}
            error={state.fieldErrors?.tagline}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('senderDomains')}>Dominios del remitente</Label>
          <Input
            id={fieldId('senderDomains')}
            name="senderDomains"
            defaultValue={platform.senderDomains.join(', ')}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="netflix.com, account.netflix.com"
            error={state.fieldErrors?.senderDomains}
            hint="Separados por comas. Se usan para reconocer correos legítimos de la plataforma."
          />
        </div>

        <div className="sm:col-span-2">
          <IconPicker
            prefix={`edit-${platform.id}`}
            defaultValue={platform.iconKey}
            error={state.fieldErrors?.iconKey}
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
        <BotonGuardar />
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function PlatformCard({ platform }: { platform: AdminPlatformRow }) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-white">
          <PlatformIcon iconKey={platform.iconKey} name={platform.name} className="size-7" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
            {platform.name}
          </p>
          <p className="truncate font-mono text-xs text-[var(--color-content-muted)]">
            {platform.slug} · ₡{platform.priceAmount.toLocaleString('es-CR')} ·{' '}
            {platform.accountCount} {platform.accountCount === 1 ? 'cuenta' : 'cuentas'}
          </p>
        </div>

        <Badge tone={platform.isActive ? 'success' : 'neutral'}>
          {platform.isActive ? 'Visible' : 'Oculta'}
        </Badge>

        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-3.5" strokeWidth={2.5} />
          Editar
        </Button>

        {/* Se oculta en lugar de borrar: una plataforma con cuentas no
            puede eliminarse por clave foránea, y ocultarla del catálogo es
            lo que se busca casi siempre. */}
        <form action={togglePlatformAction}>
          <input type="hidden" name="serviceId" value={platform.id} />
          <input type="hidden" name="activar" value={String(!platform.isActive)} />
          <Button type="submit" size="sm" variant="secondary">
            {platform.isActive ? 'Ocultar' : 'Mostrar'}
          </Button>
        </form>
      </div>

      {editing && <EditPlatformForm platform={platform} onCancel={() => setEditing(false)} />}
    </Card>
  );
}

/**
 * Alta y gestión de plataformas del catálogo.
 *
 * Al crear una, aparece en la portada de inmediato. Lo que **no** hace es
 * extraer códigos: eso exige un parser propio. La advertencia está en el propio
 * formulario porque es justo lo que se asume al añadirla y descubrirlo después
 * de vender el primer perfil sale caro.
 */
export function PlatformManager({ platforms }: { platforms: AdminPlatformRow[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createPlatformAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-28">
        <CardHeader>
          <CardTitle>Nueva plataforma</CardTitle>
        </CardHeader>

        <CardContent>
          <form ref={formRef} action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                placeholder="HBO Max"
                error={state.fieldErrors?.name}
                required
              />
            </div>

            <IconPicker prefix="create" error={state.fieldErrors?.iconKey} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Identificador</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="hbo-max"
                autoCapitalize="none"
                spellCheck={false}
                error={state.fieldErrors?.slug}
                hint="Sin espacios ni acentos. Es la clave interna y no se puede cambiar después."
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="brandColor">Color de marca</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  name="brandColor"
                  id="brandColor"
                  defaultValue="#7B2BF9"
                  aria-label="Color de marca"
                  className="h-11 w-16 shrink-0 cursor-pointer rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-1"
                />
                <span className="text-xs text-[var(--color-content-muted)]">
                  Se usa en la tarjeta del catálogo.
                </span>
              </div>
              {state.fieldErrors?.brandColor && (
                <p className="text-xs font-semibold text-[var(--color-danger)]">
                  {state.fieldErrors.brandColor}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceAmount">Precio mensual</Label>
              <Input
                id="priceAmount"
                name="priceAmount"
                type="number"
                min={0}
                step={100}
                defaultValue={3000}
                error={state.fieldErrors?.priceAmount}
                hint="En colones. Puedes cambiarlo cuando quieras."
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tagline">Frase del catálogo</Label>
              <Input
                id="tagline"
                name="tagline"
                placeholder="Series y estrenos en tu propio perfil."
                error={state.fieldErrors?.tagline}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="senderDomains">Dominios del remitente</Label>
              <Input
                id="senderDomains"
                name="senderDomains"
                placeholder="hbomax.com, mail.hbomax.com"
                autoCapitalize="none"
                spellCheck={false}
                error={state.fieldErrors?.senderDomains}
                hint="Separados por comas. Desde dónde envía sus correos esta plataforma."
              />
            </div>

            {/* Advertencia honesta: añadirla al catálogo no la hace funcionar. */}
            <p className="rounded-xl border-2 border-dashed border-[var(--color-warning)] bg-[var(--color-warning)]/10 px-3 py-2 text-xs leading-relaxed">
              Aparecerá en el catálogo enseguida, pero <strong>aún no extraerá códigos</strong>: eso
              necesita un lector de correo propio para esa plataforma. Sus correos se guardarán como
              «sin código» hasta entonces.
            </p>

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

            <BotonCrear />
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-wider text-[var(--color-content-muted)]">
          En el catálogo ({platforms.length})
        </h2>

        <div className="flex flex-col gap-3">
          {platforms.map((platform) => (
            <PlatformCard key={platform.id} platform={platform} />
          ))}
        </div>
      </section>
    </div>
  );
}
