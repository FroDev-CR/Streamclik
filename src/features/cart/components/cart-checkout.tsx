'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, Minus, Paperclip, Plus, Send, ShoppingCart, Trash2 } from 'lucide-react';

import { PlatformIcon } from '@/components/platform-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { CatalogCombo, CatalogItem } from '@/features/catalog/queries';
import { crearPedidoCarritoAction } from '@/features/orders/actions';
import { formatMoney } from '@/features/orders/presentation';
import type { ActionState } from '@/features/shared/action-state';

import { clearCart, readCart, writeCart, type CartItem } from '../storage';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full size="lg" disabled={disabled || pending}>
      <Send aria-hidden className="size-4" strokeWidth={2.5} />
      {pending ? 'Enviando…' : 'Enviar un solo comprobante'}
    </Button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // El número sigue visible si el navegador bloquea el portapapeles.
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={copy}>
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

export function CartCheckout({
  services,
  combos,
  sinpeNumber,
  sinpeName,
  instructions,
}: {
  services: CatalogItem[];
  combos: CatalogCombo[];
  sinpeNumber: string;
  sinpeName: string;
  instructions: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(crearPedidoCarritoAction, {});
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    setItems(readCart());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!state.success) return;
    clearCart();
    const timer = window.setTimeout(() => router.push('/perfil#historial-compras'), 500);
    return () => window.clearTimeout(timer);
  }, [router, state.success]);

  const products = useMemo(() => {
    const serviceMap = new Map(services.map((service) => [`service:${service.slug}`, service]));
    const comboMap = new Map(combos.map((combo) => [`combo:${combo.slug}`, combo]));

    return items.map((item) => {
      const key = `${item.productType}:${item.slug}`;
      const product = item.productType === 'service' ? serviceMap.get(key) : comboMap.get(key);
      return { item, product };
    });
  }, [combos, items, services]);

  const unavailable = products.some(({ product }) => !product || product.disponibles < 1);
  const currency = products.find(({ product }) => product)?.product?.moneda ?? 'CRC';
  const total = products.reduce(
    (sum, { item, product }) => sum + (product?.precio ?? 0) * item.quantity,
    0,
  );

  function updateItem(target: CartItem, quantity: number) {
    const next =
      quantity <= 0
        ? items.filter(
            (item) => item.productType !== target.productType || item.slug !== target.slug,
          )
        : items.map((item) =>
            item.productType === target.productType && item.slug === target.slug
              ? { ...item, quantity: Math.min(10, quantity) }
              : item,
          );
    setItems(writeCart(next));
  }

  if (!loaded) {
    return <p className="py-12 text-center text-sm text-[var(--color-content-muted)]">Cargando carrito…</p>;
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <ShoppingCart aria-hidden className="size-9" />
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-black uppercase">
            Tu carrito está vacío
          </p>
          <p className="mt-2 text-sm text-[var(--color-content-muted)]">
            Agrega uno o varios perfiles y vuelve para realizar un solo pago.
          </p>
        </div>
        <Link href="/catalogo" className="catalog-buy-button mt-2 w-full max-w-xs">
          Ver catálogo
        </Link>
      </Card>
    );
  }

  return (
    <form action={formAction} className="grid items-start gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <input type="hidden" name="cart" value={JSON.stringify(items)} />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Tu compra</CardTitle>
            <p className="text-sm text-[var(--color-content-muted)]">
              Puedes combinar plataformas, combos y varias unidades.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {products.map(({ item, product }) => {
              const name = product?.nombre ?? item.slug;
              const icon = product && 'icono' in product ? product.icono : 'generic';
              const maxQuantity = Math.max(1, Math.min(10, product?.disponibles ?? 1));

              return (
                <div
                  key={`${item.productType}:${item.slug}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] p-3"
                >
                  <span className="grid size-11 place-items-center rounded-xl border-2 border-[var(--color-border)] bg-white">
                    <PlatformIcon iconKey={icon} name={name} className="size-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-[family-name:var(--font-display)] text-sm font-black uppercase">
                      {name}
                    </p>
                    <p className="text-xs text-[var(--color-content-muted)]">
                      {product
                        ? `${formatMoney(product.precio, product.moneda)} cada uno`
                        : 'Ya no está disponible'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => updateItem(item, item.quantity - 1)}
                      aria-label={`Quitar una unidad de ${name}`}
                    >
                      <Minus aria-hidden className="size-3.5" />
                    </Button>
                    <span className="min-w-7 text-center font-mono text-sm font-bold">{item.quantity}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={item.quantity >= maxQuantity}
                      onClick={() => updateItem(item, item.quantity + 1)}
                      aria-label={`Agregar otra unidad de ${name}`}
                    >
                      <Plus aria-hidden className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => updateItem(item, 0)}
                      aria-label={`Eliminar ${name}`}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <Link href="/catalogo" className="text-sm font-bold underline underline-offset-4">
              + Agregar más productos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Un solo comprobante</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cart-receipt">Captura del pago</Label>
              <label
                htmlFor="cart-receipt"
                className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-border)] px-4 py-5"
              >
                <Paperclip aria-hidden className="size-5" />
                <span className="truncate text-sm font-semibold">
                  {fileName ?? 'Tocar para elegir la imagen o el PDF'}
                </span>
              </label>
              <input
                id="cart-receipt"
                name="receipt"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="sr-only"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              />
              {state.fieldErrors?.receipt && (
                <p className="text-xs font-semibold text-[var(--color-danger)]">
                  {state.fieldErrors.receipt}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cart-referral">Código de invitación (opcional)</Label>
              <Input
                id="cart-referral"
                name="referralCode"
                placeholder="SC-12AB34CD"
                maxLength={20}
                autoCapitalize="characters"
                error={state.fieldErrors?.referralCode}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cart-note">Nota (opcional)</Label>
              <Input
                id="cart-note"
                name="note"
                placeholder="Pagué desde otro número"
                maxLength={280}
                error={state.fieldErrors?.note}
              />
            </div>

            {state.error && (
              <p className="rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3 text-sm font-semibold text-[var(--color-danger)]">
                {state.error}
              </p>
            )}
            {state.success && (
              <p className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] p-3 text-sm font-bold">
                {state.success}
              </p>
            )}

            <SubmitButton disabled={unavailable || !sinpeNumber} />
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-28">
        <CardHeader>
          <CardTitle>Total a pagar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-brand-yellow)] p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider">Monto exacto</p>
            <p className="font-[family-name:var(--font-display)] text-4xl font-black">
              {formatMoney(total, currency)}
            </p>
          </div>

          {sinpeNumber ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--color-border)] p-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-[var(--color-content-muted)]">SINPE Móvil</p>
                <p className="font-mono text-xl font-bold">{sinpeNumber}</p>
                {sinpeName && <p className="text-xs text-[var(--color-content-muted)]">A nombre de {sinpeName}</p>}
              </div>
              <CopyButton value={sinpeNumber} />
            </div>
          ) : (
            <p className="text-sm font-semibold text-[var(--color-danger)]">
              No hay un número de SINPE configurado.
            </p>
          )}

          {instructions && <p className="text-sm leading-relaxed text-[var(--color-content-muted)]">{instructions}</p>}
          {unavailable && (
            <p className="text-sm font-semibold text-[var(--color-danger)]">
              Retira los productos sin disponibilidad antes de continuar.
            </p>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
