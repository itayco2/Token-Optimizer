/**
 * Split `arr` into chunks of `size` items; the last chunk may be shorter.
 * chunk([1, 2, 3, 4, 5], 2) → [[1, 2], [3, 4], [5]]. Throws a RangeError if size < 1.
 */
export function chunk(arr, size) {
  if (!(size >= 1)) throw new RangeError('size must be at least 1');
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Run the async `worker` on every item, one at a time and in order.
 * Resolves only after the last worker call has finished; rejects if any call rejects.
 * @param {any[]} items
 * @param {(item: any) => Promise<void>} worker
 */
export async function processAll(items, worker) {
  items.forEach(async item => {
    await worker(item);
  });
}
