import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FIXTURES, WF_PROBE } from './helpers.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'lean-swarm.js');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

test('--help and no command print help', () => {
  for (const r of [run('--help'), run()]) {
    assert.equal(r.status, 0);
    assert.match(r.stdout, /lean-swarm xray/);
  }
});

test('bad usage exits 2', () => {
  assert.equal(run('nope').status, 2);
  assert.equal(run('xray', '--top', '0').status, 2);
  assert.equal(run('xray', '--since', 'soon').status, 2);
  assert.equal(run('xray', '--bogus').status, 2);
  assert.equal(run('xray', '--compare', WF_PROBE).status, 2);
  const r = run('xray', FIXTURES);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No agent-\*\.jsonl files/);
});

test('xray over a root', () => {
  const r = run('xray', '--root', FIXTURES);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^# X-ray: 2 runs, 5 agents/);
});

test('xray on one run dir, as JSON', () => {
  const r = run('xray', WF_PROBE, '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).agentCount, 4);
});

test('--since filters runs out', () => {
  const r = run('xray', '--root', FIXTURES, '--since', '2030-01-01');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No multi-agent runs found/);
});

test('--compare and --out', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xray-')), 'c.md');
  const sub = path.dirname(path.dirname(WF_PROBE));
  const r = run('xray', '--compare', WF_PROBE, '--vs', `${WF_PROBE},${sub}`, '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /^# X-ray compare: 1 runs \(A\) vs 2 runs \(B\)/);
  const j = run('xray', '--compare', WF_PROBE, '--vs', WF_PROBE, '--json');
  assert.equal(JSON.parse(j.stdout).rows.find(x => x.name === 'Tokens read per run').change, 0);
});
