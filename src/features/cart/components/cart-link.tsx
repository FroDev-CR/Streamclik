'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CART_CHANGED_EVENT, cartUnitCount, readCart } from '../storage';

export function CartLink({ authenticated }: { authenticated: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(cartUnitCount(readCart()));
    update();
    window.addEventListener(CART_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const destination = authenticated
    ? '/carrito'
    : `/login?redirect_url=${encodeURIComponent('/carrito')}`;

  return (
    <Link href={destination} className="catalog-cart-link" aria-label={`Carrito: ${count} productos`}>
      <ShoppingCart aria-hidden />
      <span>Carrito</span>
      {count > 0 && <strong>{count > 99 ? '99+' : count}</strong>}
    </Link>
  );
}
