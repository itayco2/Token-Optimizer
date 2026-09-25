// Proof round 2: every planted bug really breaks its JSDoc, and every decoy really is correct.
// If one of these fails after an edit to proof/target-2, the answer key is wrong.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chunk, processAll } from '../proof/target-2/src/batch.js';
import { TtlCache } from '../proof/target-2/src/cache.js';
import { addDays, daysBetween, isWeekend, monthKey } from '../proof/target-2/src/dates.js';
import { escapeHtml, slugify } from '../proof/target-2/src/escape.js';
import { applyTax, formatCents, splitAmount, sumLines } from '../proof/target-2/src/money.js';
import { nextPage } from '../proof/target-2/src/page.js';
import { cloneRecord, groupByCustomer } from '../proof/target-2/src/records.js';
import { retry } from '../proof/target-2/src/retry.js';
import { byDateDesc, sortInPlace, topN } from '../proof/target-2/src/sort.js';
import { isEmail, isPositiveInt, validateInvoice } from '../proof/target-2/src/validate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, 'proof', 'grading', 'key-2.json'), 'utf8'));

test('key: each planted bug sits on the line the key says', () => {
  const needles = {
    'split-remainder': 'Array.from({ length: parts }, () => base)',
    'month-zero-based': 'String(date.getUTCMonth())',
    'escape-order': ".replace(/&/g, '&amp;')",
    'email-unanchored': '/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+/.test(s)',
    'ttl-units': 'this.ttlMs * 1000',
    'hitcount-zero': 'this.hits.get(key) || undefined',
    'retry-count': 'attempt < retries',
    'foreach-async': 'items.forEach(async item =>',
    'comparator-boolean': '(a, b) => a.date < b.date',
    'page-boundary': 'item.id >= afterId',
    'clone-dates': 'JSON.parse(JSON.stringify(rec))',
  };
  assert.equal(KEY.bugs.length, 11);
  for (const bug of KEY.bugs) {
    const lines = fs.readFileSync(path.join(ROOT, 'proof', 'target-2', bug.file), 'utf8').split('\n');
    assert.ok(lines[bug.line - 1].includes(needles[bug.id]), `${bug.id} at ${bug.file}:${bug.line}`);
  }
});

test('key: no decoy range overlaps a planted bug window, so scoring cannot confuse them', () => {
  for (const d of KEY.decoys) {
    for (const b of KEY.bugs.filter(x => x.file === d.file)) {
      const clash = d.lines[0] <= b.line + KEY.window && d.lines[1] >= b.line - KEY.window;
      assert.ok(!clash, `decoy ${d.id} overlaps bug ${b.id}`);
    }
  }
});

test('planted bugs break their JSDoc', async () => {
  assert.notEqual(splitAmount(10, 3).reduce((a, b) => a + b, 0), 10, 'split-remainder');
  assert.equal(monthKey(new Date('2026-01-15T00:00:00Z')), '2026-00', 'month-zero-based');
  assert.equal(escapeHtml('a < b'), 'a &amp;lt; b', 'escape-order');
  assert.equal(isEmail('a@b.co x'), true, 'email-unanchored');

  let now = 0;
  const cache = new TtlCache(1000, () => now);
  cache.set('k', 'v');
  now = 5000;
  assert.equal(cache.get('k'), 'v', 'ttl-units: a 5 s old entry with a 1 s ttl is still returned');
  const fresh = new TtlCache(1000, () => 0);
  fresh.set('k', 'v');
  assert.equal(fresh.hitCount('k'), undefined, 'hitcount-zero: set but never read should be 0');
  assert.equal(fresh.hitCount('toString'), undefined, 'never set');
  let t = 0;
  const expiring = new TtlCache(1, () => t);
  expiring.set('k', 'v');
  t = 1e9;
  assert.equal(expiring.get('k'), undefined);
  assert.equal(expiring.hits.get('k'), 0, 'the stored count stays 0 after expiry; only the planted line hides it');

  let calls = 0;
  await assert.rejects(retry(async () => { calls++; return 'ok'; }, 0), 'retry-count: 0 retries should still call once');
  assert.equal(calls, 0);

  const done = [];
  await processAll([1, 2, 3], async n => { await new Promise(r => setTimeout(r, 5)); done.push(n); });
  assert.deepEqual(done, [], 'foreach-async: resolved before any work finished');
  await new Promise(r => setTimeout(r, 20));

  const dates = ['2026-01-01', '2026-03-01', '2026-02-01'].map(date => ({ date }));
  assert.notDeepEqual(byDateDesc(dates).map(r => r.date), ['2026-03-01', '2026-02-01', '2026-01-01'], 'comparator-boolean');

  const items = [1, 2, 3, 4, 5].map(id => ({ id }));
  assert.deepEqual(nextPage(items, 2, 2).page.map(i => i.id), [2, 3], 'page-boundary: should be [3, 4]');

  assert.equal(cloneRecord({ at: new Date(0) }).at instanceof Date, false, 'clone-dates');
});

test('decoys do what their JSDoc says', () => {
  assert.equal(formatCents(1234), '$12.34');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(formatCents(-250), '-$2.50');
  assert.equal(applyTax(1000, 17), 1170);
  assert.equal(applyTax(50, 15), 58, 'exact half cents round up');
  assert.equal(applyTax(50, 13), 57, 'exact half cents round up');
  assert.equal(sumLines([]), 0);
  assert.equal(sumLines([{ price: 250, qty: 2 }, { price: 100, qty: 1 }]), 600);
  assert.equal(daysBetween(new Date('2026-01-01T23:00:00Z'), new Date('2026-01-02T01:00:00Z')), 1);
  assert.equal(daysBetween(new Date('2026-01-05T00:00:00Z'), new Date('2026-01-01T12:00:00Z')), -4);
  assert.equal(daysBetween(new Date('0099-12-31T00:00:00Z'), new Date('0100-01-01T00:00:00Z')), 1, 'years 0-99 too');
  assert.equal(isWeekend(new Date('2026-09-26T12:00:00Z')), true);
  assert.equal(isWeekend(new Date('2026-09-25T12:00:00Z')), false);
  assert.equal(addDays(new Date('2026-01-31T10:00:00Z'), 1).toISOString(), '2026-02-01T10:00:00.000Z');
  assert.equal(slugify('  Hello, World! '), 'hello-world');
  assert.equal(isPositiveInt(3), true);
  assert.equal(isPositiveInt('3'), false);
  assert.equal(isPositiveInt(0), false);
  assert.deepEqual(validateInvoice({ email: 'a@b.co', lines: [{ sku: 's', qty: 1 }] }), []);
  assert.deepEqual(validateInvoice({ email: 'nope', lines: [] }), ['email', 'lines']);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.throws(() => chunk([1], 1.5), RangeError);
  assert.throws(() => chunk([1], 0), RangeError);
  assert.deepEqual(validateInvoice({ email: 'a@b.co', lines: {} }), ['lines']);
  const arr = [3, 1, 2];
  assert.equal(sortInPlace(arr), arr);
  assert.deepEqual(arr, [1, 2, 3]);
  const src = [1, 5, 3];
  assert.deepEqual(topN(src, 2), [5, 3]);
  assert.deepEqual(src, [1, 5, 3]);
  const items = [1, 2, 3].map(id => ({ id }));
  assert.deepEqual(nextPage(items, undefined, 2), nextPage(items, null, 2), 'loose == null treats undefined like null');
  assert.deepEqual(nextPage(items, null, 2), { page: [{ id: 1 }, { id: 2 }], next: 2 });
  assert.deepEqual([...groupByCustomer([{ customer: 'a', n: 1 }, { customer: 'b', n: 2 }, { customer: 'a', n: 3 }]).get('a')].map(r => r.n), [1, 3]);
});
