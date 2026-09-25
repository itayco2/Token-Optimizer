import assert from 'node:assert/strict';
import test from 'node:test';
import { findRuns, parseAgent, readRun } from '../src/logs.js';
import { compare, summarize } from '../src/measure.js';
import { compareMarkdown, fmtPct, fmtTokens, json, markdown } from '../src/report.js';
import { AGENT_A, AGENT_B, FIXTURES, META_A, META_B } from './helpers.js';

const fixtures = () => summarize(findRuns(FIXTURES).map(readRun));
const legacy = () => summarize([{
  kind: 'workflow', id: 'wf_legacy', project: 'p', dir: '/x', versions: ['2.1.250'], skipped: { 'unparseable line': 2 },
  start: 0, end: 1000, agents: [parseAgent(AGENT_A, META_A), parseAgent(AGENT_B, META_B)],
}]);

test('number formats', () => {
  assert.equal(fmtTokens(8.08e9), '8.08B');
  assert.equal(fmtTokens(68000), '68.0k');
  assert.equal(fmtTokens(2.5e6), '2.5M');
  assert.equal(fmtTokens(12), '12');
  assert.equal(fmtTokens(null), '–');
  assert.equal(fmtPct(0.4312), '43%');
  assert.equal(fmtPct(null), '–');
});

test('markdown has every section, in order', () => {
  const md = markdown(fixtures());
  const heads = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  assert.deepEqual(heads, [
    'Summary', 'Tokens by kind', 'Fixed start by agent type', 'What fills the first turn',
    'Tool use', 'Where the time went', 'Models', 'What you could cut', 'Runs',
  ]);
  assert.match(md, /^# X-ray: 2 runs, 5 agents, 21 turns/);
  assert.match(md, /Claude Code versions in these logs: 2\.1\.282/);
  assert.match(md, /not in the log/);
});

test('markdown hides project names and paths unless asked', () => {
  const s = fixtures();
  assert.doesNotMatch(markdown(s), /-fixture-project/);
  assert.match(markdown(s, { showPaths: true }), /-fixture-project\/wf_probe/);
  assert.doesNotMatch(json(s), /-fixture-project|\/fixture\/path-/);
  assert.match(json(s, { showPaths: true }), /-fixture-project/);
});

test('markdown for logs that include tool definitions', () => {
  const md = markdown(legacy());
  assert.match(md, /Loaded but never called: Artifact \(1 agents\)/);
  assert.match(md, /\| Tool definitions \| 2\.3k \|/);
  assert.match(md, /Lean roles would save:\*\* about 45% of tokens read \(8\.8k\)/);
  assert.match(md, /^1970-01-01 to 1970-01-01$/m);
  assert.match(md, /Lines skipped: 2 unparseable line/);
  assert.match(md, /\| code-reviewer \| 1 \| reviewer \(100%\)/);
});

test('top limits table rows and says so', () => {
  const md = markdown(fixtures(), { top: 1 });
  assert.match(md, /Showing the 1 largest of 2 runs/);
});

test('json is complete and parseable', () => {
  const j = JSON.parse(json(fixtures()));
  assert.equal(j.runCount, 2);
  assert.equal(j.runs.length, 2);
  assert.ok(Array.isArray(j.runs[0].agents[0].called));
});

test('compareMarkdown shows both groups and the change', () => {
  const a = legacy(), b = fixtures();
  const md = compareMarkdown(compare(a, b), a, b);
  assert.match(md, /^# X-ray compare: 1 runs \(A\) vs 2 runs \(B\)/);
  assert.match(md, /\| Tokens read per run \| 19\.7k \|/);
  assert.match(md, /A agent types: code-reviewer ×1, workflow-subagent ×1/);
});
