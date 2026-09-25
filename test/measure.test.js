import assert from 'node:assert/strict';
import test from 'node:test';
import { findRuns, parseAgent, readRun } from '../src/logs.js';
import { agentStats, CHARS_PER_TOKEN, compare, leanSaving, makeup, median, runStats, summarize, toolTokens, unloggedFloor } from '../src/measure.js';
import { A, AGENT_A, AGENT_B, FIXTURES, META_A, META_B } from './helpers.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const legacyRun = () => ({
  kind: 'workflow', id: 'wf_legacy', project: 'p', dir: '/x', versions: ['2.1.250'], skipped: {},
  start: Date.parse('2026-09-01T10:00:00Z'), end: Date.parse('2026-09-01T10:00:20Z'),
  agents: [parseAgent(AGENT_A, META_A, 'a'), parseAgent(AGENT_B, META_B, 'b')],
});

test('median is the upper median, ignoring gaps', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 3);
  assert.equal(median([null, 5]), 5);
  assert.equal(median([]), null);
});

test('agentStats: tokens, fixed start, calls', () => {
  const s = agentStats(parseAgent(AGENT_A, META_A));
  assert.equal(s.read, A.read);
  assert.equal(s.fixed, A.fixed);
  assert.equal(s.tokens.output, A.output);
  assert.equal(s.turns, 3);
  assert.equal(s.calls, 3);
  assert.equal(s.oneCall, 1);
  assert.deepEqual([...s.called].sort(), ['Bash', 'Grep', 'Read']);
  assert.deepEqual(s.models, { 'claude-opus-4-7': 3 });
  assert.equal(s.firstTurn, 5010);
  assert.equal(s.type, 'code-reviewer');
});

test('agentStats: cost at list prices, 1-hour writes at 2x', () => {
  const s = agentStats(parseAgent(AGENT_A, META_A));
  // Opus 4.7: $5 in, $25 out, $0.50 cache read, $6.25 5-minute write, $10 1-hour write, per MTok.
  close(s.cost.uncached, (17 * 5) / 1e6);
  close(s.cost.cacheRead, ((5010 + 5315) * 0.5) / 1e6);
  close(s.cost.cacheWrite, ((5000 + 300) * 6.25 + 100 * 10) / 1e6);
  close(s.cost.output, (400 * 25) / 1e6);
});

test('makeup splits the billed first turn by character share when tools are logged', () => {
  const a = parseAgent(AGENT_A, META_A);
  const m = makeup(a.firstTurn);
  close(m.tools, (5010 * A.parts.tools) / A.chars);
  close(m.skillListing, (5010 * A.parts.skillListing) / A.chars);
  assert.equal(m.notInLog, 0);
  close(Object.values(m).reduce((x, y) => x + y, 0), 5010);
  const tt = toolTokens(a.firstTurn);
  close(tt.Artifact, (5010 * 1308) / A.chars);
});

test('makeup estimates logged parts and reports the rest as not in the log', () => {
  const first = { tokens: 1000, parts: { systemPrompt: 360, tools: 0, task: 36 }, toolSizes: null };
  const m = makeup(first);
  close(m.systemPrompt, 360 / CHARS_PER_TOKEN);
  close(m.task, 10);
  close(m.notInLog, 1000 - 110);
});

test('makeup never goes negative when the estimate exceeds the billed total', () => {
  const m = makeup({ tokens: 10, parts: { systemPrompt: 360, tools: 0 }, toolSizes: null });
  close(m.systemPrompt, 10);
  assert.equal(m.notInLog, 0);
  assert.equal(makeup(null), null);
});

test('leanSaving: exact when tool definitions are logged', () => {
  const a = parseAgent(AGENT_A, META_A);
  const s = leanSaving(a, new Set(['Read', 'Bash', 'Grep']));
  assert.equal(s.role, 'reviewer');
  // Drops the skill listing, the deferred-tool listing and Artifact; keeps Read and Bash.
  close(s.low, (5010 * (A.parts.skillListing + A.parts.deferredTools + 1308)) / A.chars);
  assert.equal(s.low, s.high);
});

test('leanSaving: nothing when no role fits or the agent is already lean', () => {
  const a = parseAgent(AGENT_A, META_A);
  assert.deepEqual(leanSaving(a, new Set(['Agent'])), { role: null, low: 0, high: 0 });
  const lean = { firstTurn: { tokens: 9000, parts: { systemPrompt: 100, tools: 0, skillListing: 0, deferredTools: 0 }, toolSizes: null } };
  assert.deepEqual(leanSaving(lean, new Set(['Read'])), { role: 'judge', low: 0, high: 0 });
});

test('leanSaving: a range when tool definitions are not logged, less the floor a lean agent keeps', () => {
  const agent = { firstTurn: { tokens: 10000, parts: { systemPrompt: 360, tools: 0, skillListing: 3600, deferredTools: 0 }, toolSizes: null } };
  const s = leanSaving(agent, new Set(['Read']));
  close(s.low, 1000);
  close(s.high, 1000 + (10000 - 1100));
  close(leanSaving(agent, new Set(['Read']), 2000).high, 1000 + (10000 - 1100) - 2000);
  assert.equal(leanSaving(agent, new Set(['Read']), 1e6).high, 1000);
});

test('unloggedFloor is the median unlogged start of agents that already have an allowlist', () => {
  const lean = n => ({ firstTurn: { tokens: n, parts: { systemPrompt: 36, tools: 0, skillListing: 0, deferredTools: 0 }, toolSizes: null } });
  const heavy = { firstTurn: { tokens: 50000, parts: { systemPrompt: 36, tools: 0, skillListing: 3600, deferredTools: 0 }, toolSizes: null } };
  assert.equal(unloggedFloor([lean(3010), lean(5010), heavy, { firstTurn: null }]), 5000);
  assert.equal(unloggedFloor([heavy]), 0);
});

test('runStats: duplicate reads across agents, Opus share, fixed share', () => {
  const r = runStats(legacyRun());
  assert.deepEqual(r.dup, { reads: 3, dup: 1, share: 1 / 3, toolOnlyShare: 1 / 3 });
  assert.equal(r.opusShare, 3 / 4);
  assert.equal(r.read, A.read + 4003);
  assert.equal(r.fixed, A.fixed + 4003);
  close(r.fixedShare, (A.fixed + 4003) / (A.read + 4003));
  assert.equal(r.wallMinutes, 20 / 60);
  assert.deepEqual(r.toolErrors, { total: 1, unknownTool: 1 });
});

test('summarize: legacy run shows loaded-but-never-called tools', () => {
  const s = summarize([legacyRun()]);
  assert.equal(s.loadedKnownFor, 1);
  assert.deepEqual(s.neverCalled, [{ tool: 'Artifact', loadedBy: 1 }]);
  assert.equal(s.toolUse.find(t => t.tool === 'Read').agents, 2);
  assert.equal(s.runsOpus95, 0);
  assert.equal(s.agentTypes.length, 2);
});

test('summarize on the real fixtures', () => {
  const s = summarize(findRuns(FIXTURES).map(readRun));
  assert.equal(s.runCount, 2);
  assert.equal(s.agentCount, 5);
  assert.equal(s.read + s.written, Object.values(s.tokens).reduce((x, y) => x + y, 0));
  assert.ok(s.fixedShare > 0 && s.fixedShare < 1);
  const def = s.agentTypes.find(t => t.type === 'workflow-subagent');
  assert.equal(def.medianFirstTurn, 45086);
  assert.equal(def.topRole.role, 'judge');
  assert.ok(def.medianSaving.low > 0 && def.medianSaving.high > def.medianSaving.low);
  const allowlisted = s.runs.flatMap(r => r.agents).filter(a => a.saving.high === 0).length;
  assert.equal(allowlisted, 3, 'statusline-setup and both claude-code-guide agents');
  assert.ok(s.lean.floor > 3000 && s.lean.floor < 5000, `floor ${s.lean.floor}`);
  for (const type of ['statusline-setup', 'claude-code-guide']) {
    const t = s.agentTypes.find(x => x.type === type);
    assert.equal(t.savedRead.high, 0, `${type} already has a tools allowlist`);
  }
  assert.ok(s.lean.low > 0 && s.lean.highShare < 1);
  assert.equal(s.dupShareMedianRun, 0.75);
});

test('compare: group B relative to group A', () => {
  const a = summarize([legacyRun()]);
  const b = summarize(findRuns(FIXTURES).map(readRun));
  const rows = compare(a, b);
  const read = rows.find(r => r.name === 'Tokens read per run');
  close(read.change, (b.read / 2 - a.read) / a.read);
  assert.equal(rows.find(r => r.name === 'Runs').b, 2);
});

test('runStats: a Read and a shell cat of the same file by two agents is a duplicate read', () => {
  const agent = (id, name, input) => parseAgent(JSON.stringify({
    type: 'assistant', cwd: '/repo', timestamp: '2026-09-01T10:00:00Z',
    message: { id, usage: { input_tokens: 1 }, content: [{ type: 'tool_use', id: id + 't', name, input }] },
  }), {});
  const r = runStats({
    kind: 'workflow', id: 'w', project: 'p', dir: '/x', versions: [], skipped: {}, start: null, end: null,
    agents: [agent('a', 'Read', { file_path: '/repo/src/cart.js' }), agent('b', 'Bash', { command: 'cat -n src/cart.js' })],
  });
  assert.deepEqual(r.dup, { reads: 2, dup: 1, share: 0.5, toolOnlyShare: 0 });
});
