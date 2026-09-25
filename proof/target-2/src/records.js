/**
 * Deep copy of an invoice record. Nested objects and arrays are copied, and Date values stay
 * Date objects. Changing the copy never changes the original.
 * @param {object} rec
 */
export function cloneRecord(rec) {
  return JSON.parse(JSON.stringify(rec));
}

/**
 * Group records by `record.customer`. Returns a Map from customer to that customer's records,
 * in their original order.
 */
export function groupByCustomer(records) {
  const groups = new Map();
  for (const r of records) {
    if (!groups.has(r.customer)) groups.set(r.customer, []);
    groups.get(r.customer).push(r);
  }
  return groups;
}
