import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { makeScrubber, scrubDir, scrubText } from '../scripts/scrub-fixture.js';
import { parseAgent } from '../src/logs.js';
import { AGENT_A, META_A } from './helpers.js';

test('scrubbing keeps structure, numbers, tool names and lengths, and removes text', () => {
  const out = scrubText(AGENT_A, makeScrubber(), '.jsonl');
  assert.doesNotMatch(out, /Review the diff|Looking|npm test|TODO|CLAUDE\.md|Repo/);
  const before = parseAgent(AGENT_A, META_A), after = parseAgent(out, META_A);
  assert.deepEqual(after.turns.map(t => t.usage), before.turns.map(t => t.usage));
  assert.deepEqual(after.turns.map(t => t.calls.map(c => c.name)), before.turns.map(t => t.calls.map(c => c.name)));
  assert.equal(after.firstTurn.parts.skillListing, before.firstTurn.parts.skillListing);
  assert.equal(after.firstTurn.parts.task, before.firstTurn.parts.task);
  assert.deepEqual(after.time, before.time);
});

test('the same path always gets the same placeholder', () => {
  const walk = makeScrubber();
  const a = walk({ file_path: '/secret/a.js' }), b = walk({ file_path: '/secret/b.js' }), c = walk({ file_path: '/secret/a.js' });
  assert.equal(a.file_path, c.file_path);
  assert.notEqual(a.file_path, b.file_path);
  assert.equal(walk({ url: 'https://x.test/p' }).url, 'https://example.test/1');
});

test('meta files keep the stage of the label only', () => {
  const out = JSON.parse(scrubText(JSON.stringify({ agentType: 'Explore', description: 'research: secret topic' }), makeScrubber(), '.json'));
  assert.deepEqual(out, { agentType: 'Explore', description: 'research:' + 'x'.repeat(' secret topic'.length) });
});

test('scrubDir copies a tree and skips other files', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'scrub-src-'));
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrub-dest-')), 'out');
  fs.mkdirSync(path.join(src, 'w'));
  fs.writeFileSync(path.join(src, 'w', 'agent-1.jsonl'), '{"type":"user","message":{"content":"secret"}}\nnot json\n');
  fs.writeFileSync(path.join(src, 'notes.txt'), 'secret');
  scrubDir(src, dest);
  assert.deepEqual(fs.readdirSync(dest), ['w']);
  const text = fs.readFileSync(path.join(dest, 'w', 'agent-1.jsonl'), 'utf8');
  assert.doesNotMatch(text, /secret|not json/);
});
