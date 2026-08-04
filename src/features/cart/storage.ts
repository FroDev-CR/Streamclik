export const CART_STORAGE_KEY = 'streamclick-cart-v1';
export const CART_CHANGED_EVENT = 'streamclick:cart-changed';

export type CartProductType = 'service' | 'combo';

export interface CartItem {
  productType: CartProductType;
  slug: string;
  quantity: number;
}

function normalizeItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CartItem>;
  if (candidate.productType !== 'service' && candidate.productType !== 'combo') return null;
  if (typeof candidate.slug !== 'string' || !candidate.slug.trim()) return null;

  const quantity = Math.max(1, Math.min(10, Math.trunc(Number(candidate.quantity) || 1)));
  return { productType: candidate.productType, slug: candidate.slug.trim().toLowerCase(), quantity };
}

export function normalizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  const consolidated = new Map<string, CartItem>();
  for (const raw of value.slice(0, 20)) {
    const item = normalizeItem(raw);
    if (!item) continue;
    const key = `${item.productType}:${item.slug}`;
    const previous = consolidated.get(key);
    consolidated.set(key, {
      ...item,
      quantity: Math.min(10, (previous?.quantity ?? 0) + item.quantity),
    });
  }

  return [...consolidated.values()];
}

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeCart(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): CartItem[] {
  const normalized = normalizeCart(items);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
  }
  return normalized;
}

export function addCartItem(productType: CartProductType, slug: string): CartItem[] {
  return writeCart([...readCart(), { productType, slug, quantity: 1 }]);
}

export function clearCart(): void {
  writeCart([]);
}

export function cartUnitCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}
