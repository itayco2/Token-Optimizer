/**
 * One page of results. `page` is 1-based: page 1 is the first `pageSize` items.
 * Returns an empty array for a page past the end.
 * @param {Array} items
 * @param {number} page  1-based page number
 * @param {number} pageSize  items per page, at least 1
 */
export function paginate(items, page, pageSize) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be an integer >= 1');
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be an integer >= 1');
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

/** Number of pages needed for `count` items. 0 items need 0 pages. */
export function pageCount(count, pageSize) {
  return Math.ceil(count / pageSize);
}
