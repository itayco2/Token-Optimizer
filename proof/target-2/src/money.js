// Money helpers. Amounts are integer cents.

/**
 * Format integer cents as dollars with two decimals.
 * Examples: 1234 → "$12.34", 5 → "$0.05", -250 → "-$2.50".
 * @param {number} cents
 * @returns {string}
 */
export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

/**
 * Split `cents` into `parts` shares that add up to exactly `cents` and differ by at most 1 cent.
 * The extra cents go to the first shares: splitAmount(10, 3) → [4, 3, 3].
 * @param {number} cents  a non-negative integer
 * @param {number} parts  a positive integer
 * @returns {number[]}
 */
export function splitAmount(cents, parts) {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError('parts must be a positive integer');
  const base = Math.floor(cents / parts);
  return Array.from({ length: parts }, () => base);
}

/**
 * Add a percentage tax and round to the nearest cent.
 * applyTax(1000, 17) → 1170.
 * @param {number} cents
 * @param {number} ratePct  e.g. 17 for 17%
 */
export function applyTax(cents, ratePct) {
  return Math.round(cents * (1 + ratePct / 100));
}

/**
 * Sum a list of line items ({price, qty}, price in cents).
 * An empty list sums to 0.
 */
export function sumLines(lines) {
  return lines.reduce((total, line) => total + line.price * line.qty, 0);
}
