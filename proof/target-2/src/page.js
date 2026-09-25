/**
 * True when paging should start from the first item: `afterId` is null or undefined.
 * Loose equality is intended here, so both null and undefined count.
 */
function fromStart(afterId) {
  return afterId == null;
}

/**
 * Keyset paging over `items` sorted by unique ascending numeric `id`.
 * Returns up to `limit` items (a positive integer) whose id is greater than `afterId`.
 * `afterId` null or undefined means "from the start".
 * Also returns `next`, the id to pass as afterId for the following page, or null at the end.
 */
export function nextPage(items, afterId, limit) {
  const rest = items.filter(item => fromStart(afterId) || item.id >= afterId);
  const page = rest.slice(0, limit);
  const next = rest.length > limit ? page[page.length - 1].id : null;
  return { page, next };
}
