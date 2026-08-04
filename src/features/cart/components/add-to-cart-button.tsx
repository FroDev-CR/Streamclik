'use client';

import { Check, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

import { addCartItem, type CartProductType } from '../storage';

export function AddToCartButton({
  productType,
  slug,
  label,
}: {
  productType: CartProductType;
  slug: string;
  label: string;
}) {
  const [added, setAdded] = useState(false);

  function add() {
    addCartItem(productType, slug);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <button type="button" className="catalog-buy-button" onClick={add}>
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
