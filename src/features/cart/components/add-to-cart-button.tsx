'use client';

import { Check, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { addCartItem, type CartProductType } from '../storage';

export function AddToCartButton({
  productType,
  slug,
  label,
  className,
}: {
  productType: CartProductType;
  slug: string;
  label: string;
  className?: string;
}) {
  const [added, setAdded] = useState(false);

  function add() {
    addCartItem(productType, slug);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <button type="button" className={cn('catalog-buy-button', className)} onClick={add}>
      {added ? (
        <>
          Agregado <Check aria-hidden />
        </>
      ) : (
        <>
          {label} <ShoppingCart aria-hidden />
        </>
      )}
    </button>
  );
}
