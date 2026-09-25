/**
 * Escape text for safe use inside HTML text and attribute values.
 * Replaces & < > " and ' with entities, and leaves everything else alone.
 * escapeHtml('a < b & "c"') → 'a &lt; b &amp; &quot;c&quot;'.
 * @param {string} s
 */
export function escapeHtml(s) {
  return String(s)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL slug: lowercase ASCII letters, digits and single hyphens, no hyphen at either end.
 * slugify('  Hello, World! ') → 'hello-world'.
 */
export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
