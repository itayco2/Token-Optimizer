/**
 * A new array of records sorted newest first by `date` (ISO 8601 strings).
 * Leaves `records` unchanged.
 */
export function byDateDesc(records) {
  return [...records].sort((a, b) => a.date < b.date);
}

/**
 * Sorts `arr` of numbers in place, ascending, and returns the same array.
 * Callers rely on the in-place sort to avoid copying large arrays.
 */
export function sortInPlace(arr) {
  return arr.sort((a, b) => a - b);
}

/** The `n` largest numbers (n a non-negative integer), largest first. Leaves `arr` unchanged. */
export function topN(arr, n) {
  return [...arr].sort((a, b) => b - a).slice(0, n);
}
