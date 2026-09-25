// Pure functions: parsed runs in, numbers out. docs/method.md explains each number.
import { costOf, priceFor } from './prices.js';
import { fitRole, ROLES } from './roles.js';

// Rough characters per token, used only for log parts when the tool definitions are not in the log
// (same ratio as the prototype, prefix.js).
export const CHARS_PER_TOKEN = 3.6;

const KINDS = ['uncached', 'cacheRead', 'cacheWrite', 'output'];
const BROWSER = /browser|chrome|playwright|puppeteer/i;

export const ctxOf = u => u.input + u.cacheRead + u.cacheWrite;

// Upper median, as in the prototypes.
export function median(arr) {
  const s = arr.filter(x => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

const zero = () => ({ uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
const add = (a, b) => { for (const k of KINDS) a[k] += b[k]; return a; };
const sum = o => KINDS.reduce((s, k) => s + o[k], 0);
const share = (a, b) => (b ? a / b : 0);

// First-turn makeup in tokens. When the log holds every part (CLI versions that snapshot tool
// definitions), the billed first-turn total is split by each part's share of characters. When it
// doesn't, logged parts are estimated from characters and the rest is reported as notInLog.
export function makeup(first) {
  if (!first) return null;
  const logged = Object.entries(first.parts).filter(([, v]) => v > 0);
  const chars = logged.reduce((a, [, v]) => a + v, 0);
  const out = { notInLog: 0 };
  if (first.parts.tools > 0) {
    for (const [k, v] of logged) out[k] = (first.tokens * v) / chars;
    return out;
  }
  let est = logged.map(([k, v]) => [k, v / CHARS_PER_TOKEN]);
  const total = est.reduce((a, [, v]) => a + v, 0);
  if (total > first.tokens) est = est.map(([k, v]) => [k, (v * first.tokens) / total]);
  for (const [k, v] of est) out[k] = v;
  out.notInLog = Math.max(0, first.tokens - Math.min(total, first.tokens));
  return out;
}

// Tokens of each loaded tool definition, when the log has them.
export function toolTokens(first) {
  if (!first || !first.toolSizes) return null;
  const chars = Object.values(first.parts).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(first.toolSizes).map(([n, c]) => [n, (first.tokens * c) / chars]));
}

// Agents that already have a tools allowlist start without the skill and deferred-tool listings.
export const isAllowlisted = first => Boolean(first) && !first.toolSizes && !first.parts.skillListing && !first.parts.deferredTools;

// What agents that already have an allowlist still start with outside the log (median): their own
// few tool definitions and other unlogged content. A lean role keeps about that much.
export function unloggedFloor(agents) {
  return median(agents.map(a => a.firstTurn).filter(isAllowlisted).map(f => makeup(f).notInLog)) || 0;
}

// What a lean role would remove from this agent's start, per turn.
// Exact when tool definitions are in the log. Otherwise a range: the listings alone (low), up to the
// listings plus everything not in the log except the floor a lean agent keeps (high).
export function leanSaving(agent, called, floor = 0) {
  const role = fitRole(called);
  const first = agent.firstTurn;
  if (!role || !first) return { role: role && role.name, low: 0, high: 0 };
  if (isAllowlisted(first)) return { role: role.name, low: 0, high: 0 };
  const mk = makeup(first);
  const listings = (mk.skillListing || 0) + (mk.deferredTools || 0);
  const tt = toolTokens(first);
  if (tt) {
    const keep = new Set([...role.tools, 'StructuredOutput', 'SubagentHandback']);
    const tools = Object.entries(tt).filter(([n]) => !keep.has(n)).reduce((a, [, v]) => a + v, 0);
    return { role: role.name, low: listings + tools, high: listings + tools };
  }
  return { role: role.name, low: listings, high: listings + Math.max(0, mk.notInLog - floor) };
}

export function agentStats(agent) {
  const tokens = zero();
  const cost = zero();
  const models = {};
  const called = new Set();
  const keys = new Set();
  let calls = 0, oneCall = 0, unpriced = 0;
  for (const t of agent.turns) {
    const u = t.usage;
    add(tokens, { uncached: u.input, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, output: u.output });
    add(cost, costOf(u, t.model));
    if (t.model) models[t.model] = (models[t.model] || 0) + 1;
    if (t.model && !priceFor(t.model).known && t.model !== '<synthetic>') unpriced++;
    calls += t.calls.length;
    if (t.calls.length === 1) oneCall++;
    for (const c of t.calls) { called.add(c.name); if (c.key) keys.add(c.key); }
  }
  const read = tokens.uncached + tokens.cacheRead + tokens.cacheWrite;
  const first = agent.turns.length ? ctxOf(agent.turns[0].usage) : 0;
  return {
    type: agent.agentType || 'unknown',
    turns: agent.turns.length,
    tokens,
    read,
    fixed: first * agent.turns.length,
    firstTurn: agent.firstTurn ? agent.firstTurn.tokens : null,
    cost,
    models,
    unpriced,
    calls,
    oneCall,
    called,
    keys,
    time: agent.time,
    toolErrors: agent.toolErrors,
    minutes: agent.start !== null && agent.end !== null ? (agent.end - agent.start) / 60000 : 0,
    saving: leanSaving(agent, called),
  };
}

export function runStats(run) {
  const agents = run.agents.map(agentStats);
  const tokens = zero();
  const cost = zero();
  const models = {};
  const time = {};
  const reads = {};
  let fixed = 0, turns = 0, calls = 0, oneCall = 0;
  const toolErrors = { total: 0, unknownTool: 0 };
  for (const a of agents) {
    add(tokens, a.tokens);
    add(cost, a.cost);
    fixed += a.fixed;
    turns += a.turns;
    calls += a.calls;
    oneCall += a.oneCall;
    for (const [m, n] of Object.entries(a.models)) models[m] = (models[m] || 0) + n;
    for (const [k, v] of Object.entries(a.time)) time[k] = (time[k] || 0) + v;
    for (const k of a.keys) reads[k] = (reads[k] || 0) + 1;
    toolErrors.total += a.toolErrors.total;
    toolErrors.unknownTool += a.toolErrors.unknownTool;
  }
  const read = tokens.uncached + tokens.cacheRead + tokens.cacheWrite;
  const readCounts = Object.values(reads);
  const totalReads = readCounts.reduce((x, y) => x + y, 0);
  const dupReads = readCounts.reduce((x, n) => x + (n > 1 ? n - 1 : 0), 0);
  const modelTurns = Object.values(models).reduce((x, y) => x + y, 0);
  const opusTurns = Object.entries(models).filter(([m]) => /opus/i.test(m)).reduce((x, [, n]) => x + n, 0);
  return {
    kind: run.kind,
    id: run.id,
    project: run.project,
    dir: run.dir,
    start: run.start,
    end: run.end,
    versions: run.versions,
    skipped: run.skipped,
    agents,
    agentCount: agents.length,
    turns,
    calls,
    oneCall,
    tokens,
    read,
    fixed,
    fixedShare: share(fixed, read),
    cost,
    costTotal: sum(cost),
    rereadCostShare: share(cost.cacheRead, sum(cost)),
    dup: { reads: totalReads, dup: dupReads, share: share(dupReads, totalReads) },
    models,
    opusShare: share(opusTurns, modelTurns),
    time,
    toolErrors,
    wallMinutes: run.start !== null && run.end !== null ? (run.end - run.start) / 60000 : 0,
    maxAgentMinutes: Math.max(0, ...agents.map(a => a.minutes)),
  };
}

function medianMakeup(agentsWithFirst) {
  const mks = agentsWithFirst.map(a => makeup(a.firstTurn)).filter(Boolean);
  if (!mks.length) return null;
  const keys = [...new Set(mks.flatMap(m => Object.keys(m)))];
  const out = {};
  for (const k of keys) out[k] = median(mks.map(m => m[k] || 0));
  return out;
}

// Everything the report shows, over a set of parsed runs.
export function summarize(parsedRuns) {
  const runs = parsedRuns.map(runStats);
  const all = runs.flatMap(r => r.agents);
  const parsedAgents = parsedRuns.flatMap(r => r.agents);
  const floor = unloggedFloor(parsedAgents);
  all.forEach((a, i) => { a.saving = leanSaving(parsedAgents[i], a.called, floor); });

  const tokens = zero();
  const cost = zero();
  const models = {};
  const time = {};
  const skipped = {};
  const versions = new Set();
  let fixed = 0, turns = 0, calls = 0, oneCall = 0, unpriced = 0;
  const toolErrors = { total: 0, unknownTool: 0 };
  for (const r of runs) {
    add(tokens, r.tokens);
    add(cost, r.cost);
    fixed += r.fixed;
    turns += r.turns;
    calls += r.calls;
    oneCall += r.oneCall;
    for (const [m, n] of Object.entries(r.models)) models[m] = (models[m] || 0) + n;
    for (const [k, v] of Object.entries(r.time)) time[k] = (time[k] || 0) + v;
    for (const [k, v] of Object.entries(r.skipped)) skipped[k] = (skipped[k] || 0) + v;
    for (const v of r.versions) versions.add(v);
    toolErrors.total += r.toolErrors.total;
    toolErrors.unknownTool += r.toolErrors.unknownTool;
  }
  for (const a of all) unpriced += a.unpriced;
  const read = tokens.uncached + tokens.cacheRead + tokens.cacheWrite;

  // Tool use: share of agents that called each tool, and that loaded it when the log says.
  const toolCounts = {};
  const loadedCounts = {};
  let agentsWithLoaded = 0;
  let browserAgents = 0;
  all.forEach((a, i) => {
    for (const t of a.called) toolCounts[t] = (toolCounts[t] || 0) + 1;
    if ([...a.called].some(t => BROWSER.test(t))) browserAgents++;
    const direct = parsedAgents[i].firstTurn && parsedAgents[i].firstTurn.loaded.direct;
    if (direct) {
      agentsWithLoaded++;
      for (const t of direct) loadedCounts[t] = (loadedCounts[t] || 0) + 1;
    }
  });
  const toolUse = Object.entries(toolCounts)
    .map(([tool, n]) => ({ tool, agents: n, share: share(n, all.length) }))
    .sort((a, b) => b.agents - a.agents);
  const neverCalled = Object.entries(loadedCounts)
    .filter(([t]) => !toolCounts[t])
    .map(([tool, n]) => ({ tool, loadedBy: n }))
    .sort((a, b) => b.loadedBy - a.loadedBy);

  // Per agent type: start size, makeup, and what a lean role would save.
  const byType = new Map();
  all.forEach((a, i) => {
    if (!byType.has(a.type)) byType.set(a.type, []);
    byType.get(a.type).push({ stats: a, parsed: parsedAgents[i] });
  });
  const agentTypes = [...byType.entries()].map(([type, list]) => {
    const st = list.map(x => x.stats);
    const read = st.reduce((x, a) => x + a.read, 0);
    const fixed = st.reduce((x, a) => x + a.fixed, 0);
    const roleCounts = {};
    for (const a of st) { const k = a.saving.role || 'none'; roleCounts[k] = (roleCounts[k] || 0) + 1; }
    const topRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      type,
      agents: st.length,
      medianFirstTurn: median(st.map(a => a.firstTurn)),
      medianTurns: median(st.map(a => a.turns)),
      read,
      fixedShare: share(fixed, read),
      makeup: medianMakeup(list.map(x => x.parsed).filter(p => p.firstTurn)),
      roles: roleCounts,
      topRole: topRole ? { role: topRole[0], share: share(topRole[1], st.length) } : null,
      medianSaving: { low: median(st.map(a => a.saving.low)), high: median(st.map(a => a.saving.high)) },
      // The fixed start is re-read on every turn, so a smaller start saves (saving x turns).
      savedRead: {
        low: st.reduce((x, a) => x + a.saving.low * a.turns, 0),
        high: st.reduce((x, a) => x + a.saving.high * a.turns, 0),
      },
    };
  }).sort((a, b) => b.agents - a.agents);

  const savedLow = agentTypes.reduce((x, t) => x + t.savedRead.low, 0);
  const savedHigh = agentTypes.reduce((x, t) => x + t.savedRead.high, 0);
  const timeTotal = Object.values(time).reduce((x, y) => x + y, 0);
  const starts = runs.map(r => r.start).filter(x => x !== null);
  const ends = runs.map(r => r.end).filter(x => x !== null);

  return {
    runCount: runs.length,
    agentCount: all.length,
    turns,
    calls,
    from: starts.length ? Math.min(...starts) : null,
    to: ends.length ? Math.max(...ends) : null,
    tokens,
    read,
    written: tokens.output,
    cost,
    costTotal: sum(cost),
    unpricedTurns: unpriced,
    fixed,
    fixedShare: share(fixed, read),
    fixedShareMedianRun: median(runs.map(r => r.fixedShare)),
    rereadCostShareMedianRun: median(runs.map(r => r.rereadCostShare)),
    dupShareMedianRun: median(runs.map(r => r.dup.share)),
    runsDup30: runs.filter(r => r.dup.share >= 0.3).length,
    runsOpus95: runs.filter(r => r.opusShare >= 0.95).length,
    models,
    time,
    timeTotal,
    secondsPerTurn: share(timeTotal / 1000, turns),
    oneCallShare: share(oneCall, turns),
    callsPerTurn: share(calls, turns),
    medianTurnsPerAgent: median(all.map(a => a.turns)),
    toolUse,
    browserShare: share(browserAgents, all.length),
    loadedKnownFor: agentsWithLoaded,
    neverCalled,
    agentTypes,
    lean: { low: savedLow, high: savedHigh, lowShare: share(savedLow, read), highShare: share(savedHigh, read), floor },
    toolErrors,
    versions: [...versions].sort(),
    skipped,
    runs,
  };
}

// Group A vs group B, for before/after runs.
export function compare(a, b) {
  const row = (name, f, better = 'lower') => {
    const x = f(a), y = f(b);
    return { name, a: x, b: y, change: x ? (y - x) / x : null, better };
  };
  const perRun = (s, f) => (s.runCount ? s.runs.reduce((x, r) => x + f(r), 0) / s.runCount : 0);
  const medianFirst = s => median(s.runs.flatMap(r => r.agents.map(ag => ag.firstTurn)));
  return [
    row('Runs', s => s.runCount, 'same'),
    row('Agents per run', s => s.agentCount / Math.max(1, s.runCount), 'same'),
    row('Tokens read per run', s => s.read / Math.max(1, s.runCount)),
    row('  cache read', s => s.tokens.cacheRead / Math.max(1, s.runCount)),
    row('  cache write', s => s.tokens.cacheWrite / Math.max(1, s.runCount)),
    row('  uncached', s => s.tokens.uncached / Math.max(1, s.runCount)),
    row('Tokens written per run', s => s.written / Math.max(1, s.runCount)),
    row('API-price equivalent per run (USD)', s => s.costTotal / Math.max(1, s.runCount)),
    row('Median first-turn context', medianFirst),
    row('Fixed-start share of tokens read', s => s.fixedShare),
    row('Turns per run', s => s.turns / Math.max(1, s.runCount)),
    row('Wall-clock per run (min)', s => perRun(s, r => r.wallMinutes)),
    row('Unknown-tool errors', s => s.toolErrors.unknownTool),
  ];
}

export { ROLES };
