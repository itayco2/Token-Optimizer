import assert from 'node:assert/strict';
import test from 'node:test';
import { costOf, priceFor } from '../src/prices.js';

test('priceFor knows each family and its cache-read rate', () => {
  assert.deepEqual(priceFor('claude-opus-5-5'), { known: true, input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 });
  assert.equal(priceFor('claude-fable-5-1').cacheRead, 0.25);
  assert.equal(priceFor('claude-fable-5').cacheRead, 1);
  assert.equal(priceFor('claude-opus-4-7').input, 5);
  assert.equal(priceFor('claude-opus-4-1-20250805').input, 15);
  assert.equal(priceFor('claude-sonnet-5').output, 10);
  assert.equal(priceFor('claude-sonnet-4-6').input, 3);
  assert.equal(priceFor('claude-haiku-4-5-20251001').input, 1);
  assert.equal(priceFor('claude-3-5-haiku').input, 0.8);
});

test('unknown models are priced like Opus 5 and flagged', () => {
  const p = priceFor('some-new-model');
  assert.equal(p.known, false);
  assert.equal(p.input, 5);
  assert.equal(priceFor(null).known, false);
});

test('costOf prices 5-minute and 1-hour writes differently, unsplit writes as 5-minute', () => {
  const u = { input: 1e6, cacheRead: 1e6, cacheWrite: 3e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6, output: 1e6 };
  const c = costOf(u, 'claude-sonnet-4-6');
  assert.equal(c.uncached, 3);
  assert.ok(Math.abs(c.cacheRead - 0.3) < 1e-9);
  assert.equal(c.cacheWrite, 3.75 + 6 + 3.75);
  assert.equal(c.output, 15);
});
