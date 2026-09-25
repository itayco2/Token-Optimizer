import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { KEY, readProofRun, scoreFindings, scoreTable } from '../proof/score.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every planted bug sits on the line the key says', () => {
  const needles = {
    'remove-missing-sku': 'splice(idx, 1)',
    'discount-subtracted': 'gross - discountPct',
    'sort-mutates': 'return items.sort(',
    'page-off-by-one': 'const start = page * pageSize',
    'path-traversal': 'path.join(receiptsDir, name)',
    'missing-await': 'db.write(`order:',
  };
  for (const bug of KEY.bugs) {
    const lines = fs.readFileSync(path.join(ROOT, 'proof', 'target', bug.file), 'utf8').split('\n');
    assert.ok(lines[bug.line - 1].includes(needles[bug.id]), `${bug.id} at ${bug.file}:${bug.line}`);
  }
});

test('scoreFindings matches by file and nearby line, once each', () => {
  const s = scoreFindings([
    { file: 'src/cart.js', line: 25 },
    { file: './src/cart.js', line: 24 },
    { file: 'proof/target/src/pagination.js', line: 12 },
    { file: 'src\\orders.js', line: 9 },
    { file: 'src/orders.js', line: 9 },
    { file: 'src/receipts.js', line: 30 },
  ]);
  assert.deepEqual(s.matched.map(m => m.bug), ['remove-missing-sku', 'page-off-by-one', 'missing-await']);
  assert.equal(s.matched[0].finding.line, 24, 'closest line wins');
  assert.deepEqual(s.missed, ['discount-subtracted', 'sort-mutates', 'path-traversal']);
  assert.equal(s.other.length, 3);
  assert.equal(s.recall, 0.5);
});

test('readProofRun finds the report, the variant and any peek at the key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-'));
  const w = (f, lines) => fs.writeFileSync(path.join(dir, f), lines.map(x => JSON.stringify(x)).join('\n'));
  w('journal.jsonl', [
    { type: 'started', agentId: 'a1', label: 'find:logic' },
    { type: 'started', agentId: 'a2', label: 'report' },
    { type: 'result', agentId: 'a1', result: { findings: [] } },
    { type: 'result', agentId: 'a2', result: { findings: [{ file: 'src/cart.js', line: 36, title: 't', why: 'w' }] } },
  ]);
  fs.writeFileSync(path.join(dir, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'lean-swarm:reviewer' }));
  w('agent-a1.jsonl', [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/r/proof/grading/key.json' } }] } }]);
  const r = readProofRun(dir);
  assert.equal(r.variant, 'lean');
  assert.equal(r.touchedKey, true);
  assert.equal(r.findings.length, 1);
  assert.match(scoreTable([r]), /\| lean \| 1\/6 \| discount-subtracted \|.*\| 0 \| yes \|/);
  assert.match(scoreTable([{ dir, variant: 'plain', findings: null, touchedKey: false }]), /no report found/);
});

test('the workflow script differs between variants only in agent type', () => {
  const src = fs.readFileSync(path.join(ROOT, 'proof', 'review.workflow.js'), 'utf8');
  assert.match(src, /variant === 'lean' \? \{ agentType: 'lean-swarm:reviewer' \} : \{\}/);
  assert.match(src, /variant === 'lean' \? \{ agentType: 'lean-swarm:judge' \} : \{\}/);
  assert.equal((src.match(/agentType/g) || []).length, 2);
});

// Run the workflow script the way the Workflow runtime does: an async body with injected helpers.
async function runWorkflow(args) {
  const src = fs.readFileSync(path.join(ROOT, 'proof', 'review.workflow.js'), 'utf8').replace(/^export const meta/m, 'const meta');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const fn = new AsyncFunction('args', 'agent', 'pipeline', 'parallel', 'phase', 'log', src);
  const calls = [];
  const agent = async (prompt, opts) => { calls.push({ prompt, opts }); return { findings: [{ file: 'src/cart.js', line: 24, title: 't', why: 'w' }] }; };
  const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let r = item;
    for (const stage of stages) r = await stage(r, item, i);
    return r;
  }));
  const result = await fn(args, agent, pipeline, null, () => {}, () => {});
  return { result, calls };
}

test('workflow: lean uses the roles, plain uses default agents, prompts are identical', async () => {
  const target = '/abs/proof/target';
  const lean = await runWorkflow({ variant: 'lean', target });
  const plain = await runWorkflow({ variant: 'plain', target });
  assert.equal(lean.calls.length, 7);
  assert.deepEqual(lean.calls.map(c => c.opts.agentType), [...Array(6).fill('lean-swarm:reviewer'), 'lean-swarm:judge']);
  assert.ok(plain.calls.every(c => !('agentType' in c.opts)));
  assert.deepEqual(lean.calls.map(c => c.prompt).sort(), plain.calls.map(c => c.prompt).sort());
  assert.ok(lean.calls.every(c => c.prompt.includes(`Only read files under ${target}`)));
  assert.deepEqual(lean.result, { variant: 'lean', findings: [{ file: 'src/cart.js', line: 24, title: 't', why: 'w' }] });
  await assert.rejects(runWorkflow({ variant: 'fast', target }), /variant/);
  await assert.rejects(runWorkflow({ variant: 'lean' }), /target/);
});
