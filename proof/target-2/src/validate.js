/**
 * True only if the whole string is an email address: something@domain.tld,
 * with no spaces anywhere. isEmail('a@b.co') → true, isEmail('a@b.co x') → false.
 * @param {string} s
 */
export function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(s);
}

/** True for integers greater than 0. Strings are never positive integers. */
export function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

/**
 * Check a new-invoice request: {email, lines}, where lines, if present, is an array of
 * {sku, qty} objects. Returns a list of problems; an empty list means it's valid.
 * Needs a customer email, at least one line, and positive integer quantities.
 */
export function validateInvoice(req) {
  const problems = [];
  if (!isEmail(req.email || '')) problems.push('email');
  const lines = Array.isArray(req.lines) ? req.lines : [];
  if (lines.length === 0) problems.push('lines');
  for (const line of lines) {
    if (!isPositiveInt(line.qty)) problems.push(`qty:${line.sku}`);
  }
  return problems;
}
