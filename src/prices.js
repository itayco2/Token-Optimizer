// List prices in USD per million tokens, used as relative weights.
// Source: Anthropic API pricing as bundled with Claude Code 2.1.282 (claude-api skill, cached 2026-06-24).
// Cache writes cost 1.25x the input price with a 5-minute TTL and 2x with a 1-hour TTL.
// Cache reads cost 0.1x the input price, except where a model lists its own rate.
export const PRICES_AS_OF = '2026-06-24';

const TABLE = [
  { match: /fable-5-1|mythos-5-1/, input: 10, output: 50, cacheRead: 0.25 },
  { match: /fable-5|mythos-5/, input: 10, output: 50, cacheRead: 1.0 },
  { match: /opus-5-5/, input: 4, output: 20, cacheRead: 0.2 },
  { match: /opus-5|opus-4-[5-9]/, input: 5, output: 25 },
  { match: /opus/, input: 15, output: 75 },
  { match: /sonnet-5/, input: 2, output: 10 },
  { match: /sonnet/, input: 3, output: 15 },
  { match: /haiku-4/, input: 1, output: 5 },
  { match: /haiku/, input: 0.8, output: 4 },
];

// Unknown models are priced like Opus 5 so their tokens still count; reports flag them.
const FALLBACK = { input: 5, output: 25 };

export function priceFor(model) {
  const id = String(model || '').toLowerCase();
  const row = TABLE.find(r => r.match.test(id));
  const p = row || FALLBACK;
  return {
    known: Boolean(row),
    input: p.input,
    output: p.output,
    cacheRead: p.cacheRead ?? p.input * 0.1,
    cacheWrite5m: p.input * 1.25,
    cacheWrite1h: p.input * 2,
  };
}

// Cost in USD at list prices for one turn's usage (see logs.js for the usage shape).
export function costOf(usage, model) {
  const p = priceFor(model);
  const w5 = usage.cacheWrite5m, w1 = usage.cacheWrite1h;
  // Older logs don't split writes by TTL; treat unsplit writes as 5-minute.
  const unsplit = Math.max(0, usage.cacheWrite - w5 - w1);
  return {
    uncached: (usage.input * p.input) / 1e6,
    cacheRead: (usage.cacheRead * p.cacheRead) / 1e6,
    cacheWrite: ((w5 + unsplit) * p.cacheWrite5m + w1 * p.cacheWrite1h) / 1e6,
    output: (usage.output * p.output) / 1e6,
  };
}
