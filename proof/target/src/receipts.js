import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Read a stored receipt. `name` comes from the customer's request.
 * Throws an Error if `name` would resolve to a file outside `receiptsDir`.
 * @param {string} receiptsDir  absolute path of the receipts folder
 * @param {string} name  receipt file name, e.g. "2026-09-25-1042.txt"
 */
export async function readReceipt(receiptsDir, name) {
  const file = path.join(receiptsDir, name);
  return fs.readFile(file, 'utf8');
}

/** Receipt file name for an order: "<date>-<orderId>.txt", date as YYYY-MM-DD. */
export function receiptName(order) {
  const date = new Date(order.createdAt).toISOString().slice(0, 10);
  return `${date}-${order.id}.txt`;
}
