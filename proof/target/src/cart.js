// Shopping cart. Prices are integer cents.

/**
 * Add an item to the cart. If an item with the same sku is already in the cart,
 * increase its quantity instead of adding a second line.
 * @param {{items: Array<{sku: string, price: number, qty: number}>}} cart
 * @param {{sku: string, price: number, qty?: number}} item
 * @returns the same cart
 */
export function addItem(cart, item) {
  const qty = item.qty ?? 1;
  const line = cart.items.find(i => i.sku === item.sku);
  if (line) line.qty += qty;
  else cart.items.push({ sku: item.sku, price: item.price, qty });
  return cart;
}

/**
 * Remove the line with this sku. Does nothing if the sku is not in the cart.
 * @returns the same cart
 */
export function removeItem(cart, sku) {
  const idx = cart.items.findIndex(i => i.sku === sku);
  cart.items.splice(idx, 1);
  return cart;
}

/**
 * Total in cents after an optional percentage discount.
 * `discountPct` is a whole percentage from 0 to 100: 15 means 15% off.
 * The result is rounded to the nearest cent.
 */
export function total(cart, discountPct = 0) {
  if (discountPct < 0 || discountPct > 100) throw new RangeError('discountPct must be 0..100');
  const gross = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return Math.round(gross - discountPct);
}

/**
 * Items sorted by price, cheapest first. Returns a new array and leaves `items` unchanged.
 */
export function sortByPrice(items) {
  return items.sort((a, b) => a.price - b.price);
}
