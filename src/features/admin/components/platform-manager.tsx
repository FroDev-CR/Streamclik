'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { ActionState } from '@/features/shared/action-state';

import { createPlatformAction, togglePlatformAction } from '../actions';
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
          {platforms.map((plataforma) => (
            <Card key={plataforma.id} className="flex flex-wrap items-center gap-3 p-4">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--color-border)] font-[family-name:var(--font-display)] text-lg font-black text-white"
                style={{ backgroundColor: plataforma.brandColor }}
              >
                {plataforma.name.charAt(0)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-[family-name:var(--font-display)] text-base font-black uppercase leading-tight">
                  {plataforma.name}
                </p>
                <p className="truncate font-mono text-xs text-[var(--color-content-muted)]">
                  {plataforma.slug} · ₡{plataforma.priceAmount.toLocaleString('es-CR')} ·{' '}
                  {plataforma.accountCount}{' '}
                  {plataforma.accountCount === 1 ? 'cuenta' : 'cuentas'}
                </p>
              </div>

              <Badge tone={plataforma.isActive ? 'success' : 'neutral'}>
                {plataforma.isActive ? 'Visible' : 'Oculta'}
              </Badge>

              {/* Se oculta en lugar de borrar: una plataforma con cuentas no
                  puede eliminarse por clave foránea, y ocultarla del catálogo es
                  lo que se busca casi siempre. */}
              <form action={togglePlatformAction}>
                <input type="hidden" name="serviceId" value={plataforma.id} />
                <input type="hidden" name="activar" value={String(!plataforma.isActive)} />
                <Button type="submit" size="sm" variant="secondary">
                  {plataforma.isActive ? 'Ocultar' : 'Mostrar'}
                </Button>
              </form>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
