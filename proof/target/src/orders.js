/**
 * Save an order. Resolves once the order is written.
 * Rejects with an Error whose message starts with "save failed:" if the write fails.
 * @param {{write: (key: string, value: object) => Promise<void>}} db
 * @param {{id: string}} order
 */
export async function saveOrder(db, order) {
  try {
    db.write(`order:${order.id}`, order);
  } catch (err) {
    throw new Error(`save failed: ${err.message}`);
  }
}

/**
 * Orders placed on or after `since` (a Date), newest first.
 * Leaves `orders` unchanged.
 */
export function recentOrders(orders, since) {
  return orders
    .filter(o => new Date(o.createdAt) >= since)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
