import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { findRuns, parseAgent, readKey, readRun, runFromDir, shellReadKeys, strLen } from '../src/logs.js';
import { A, AGENT_A, AGENT_BROKEN, FIXTURES, META_A, WF_PROBE } from './helpers.js';

test('parseAgent: one turn per message id, output from its last line', () => {
  const a = parseAgent(AGENT_A, META_A, 'a');
  assert.equal(a.turns.length, A.turns);
  assert.deepEqual(a.turns.map(t => t.usage.input + t.usage.cacheRead + t.usage.cacheWrite), A.contexts);
  assert.equal(a.turns.reduce((x, t) => x + t.usage.output, 0), A.output);
  assert.equal(a.turns[2].usage.cacheWrite1h, 100);
  assert.equal(a.agentType, 'code-reviewer');
  assert.equal(a.phase, 'Review');
  assert.deepEqual(a.versions, ['2.1.250']);
});

test('parseAgent: tool calls and read keys', () => {
  const a = parseAgent(AGENT_A, META_A);
  assert.deepEqual(a.turns.map(t => t.calls.map(c => c.name)), [['Read'], ['Bash', 'Grep'], []]);
  assert.equal(a.turns[0].calls[0].key, 'file:c:/repo/a.js');
  assert.equal(a.turns[1].calls[1].key, 'grep:TODO@src');
  assert.equal(a.turns[1].calls[0].key, null);
});

test('parseAgent: first-turn makeup from snapshot and attachments', () => {
  const a = parseAgent(AGENT_A, META_A);
  assert.equal(a.firstTurn.tokens, 5010);
  assert.deepEqual(a.firstTurn.parts, A.parts);
  assert.deepEqual(a.firstTurn.toolSizes, { Read: 304, Artifact: 1308, Bash: 204 });
  assert.deepEqual(a.firstTurn.loaded, { direct: ['Read', 'Artifact', 'Bash'], deferred: ['WebFetch'] });
  assert.deepEqual(a.firstTurn.files.map(f => [f.kind, f.chars]), [['instructions', 500], ['memory', 200]]);
});

test('parseAgent: time split goes to what the later line is', () => {
  const a = parseAgent(AGENT_A, META_A);
  assert.deepEqual(a.time, { other: 0, ...A.time });
  assert.equal(a.end - a.start, 20000);
});

test('parseAgent: tool errors, including tools the agent does not have', () => {
  const a = parseAgent(AGENT_A, META_A);
  assert.deepEqual(a.toolErrors, { total: 1, unknownTool: 1 });
});

test('parseAgent: broken input is counted, not thrown', () => {
  const a = parseAgent(AGENT_BROKEN, {});
  assert.deepEqual(a.skipped, { 'unparseable line': 1, 'unknown line type': 1 });
  assert.equal(a.turns.length, 0);
  assert.equal(a.firstTurn, null);
  assert.equal(a.agentType, null);
});

test('parseAgent: a turn that never reports usage has no tokens and no first-turn makeup', () => {
  const a = parseAgent(JSON.stringify({ type: 'assistant', timestamp: '2026-09-01T10:00:00Z', message: { id: 'm1', content: [] } }), {});
  assert.equal(a.turns.length, 1);
  assert.equal(a.turns[0].usage.input, 0);
  assert.equal(a.firstTurn, null);
});

test('parseAgent: assistant line without a message is skipped', () => {
  const a = parseAgent(JSON.stringify({ type: 'assistant', timestamp: '2026-09-01T10:00:00Z' }), {});
  assert.deepEqual(a.skipped, { 'assistant line without message': 1 });
  assert.equal(a.turns.length, 0);
});

test('parseAgent: usage can arrive on a later line of the same turn', () => {
  const text = [
    { type: 'assistant', timestamp: '2026-09-01T10:00:00Z', message: { id: 'm1', content: [] } },
    { type: 'assistant', timestamp: '2026-09-01T10:00:01Z', message: { id: 'm1', content: [], usage: { input_tokens: 7, output_tokens: 3 } } },
  ].map(x => JSON.stringify(x)).join('\n');
  const a = parseAgent(text, {});
  assert.equal(a.turns.length, 1);
  assert.equal(a.turns[0].usage.input, 7);
  assert.equal(a.turns[0].usage.output, 3);
  assert.equal(a.firstTurn.tokens, 7, "usage from a later line of the same turn still counts");
});

test('readKey matches the prototype', () => {
  assert.equal(readKey('Read', { file_path: 'C:\\X\\Y.md' }), 'file:c:/x/y.md');
  assert.equal(readKey('WebFetch', { url: 'https://a.test/p/?q=1#h' }), 'url:https://a.test/p');
  assert.equal(readKey('Glob', { pattern: '*.js' }), 'glob:*.js@');
  assert.equal(readKey('Bash', { command: 'ls' }), null);
  assert.equal(readKey('Read', null), null);
});

test('strLen counts string values only', () => {
  assert.equal(strLen({ a: 'xy', b: ['z', { c: 'w' }], n: 5 }), 4);
});

test('findRuns finds workflow runs and plain subagents', () => {
  const runs = findRuns(FIXTURES);
  assert.deepEqual(runs.map(r => [r.kind, r.id]).sort(), [['subagents', 'session-1'], ['workflow', 'wf_probe']]);
  assert.ok(runs.every(r => r.project === '-fixture-project'));
});

test('findRuns on a missing root finds nothing', () => {
  assert.deepEqual(findRuns(path.join(FIXTURES, 'nope')), []);
});

test('runFromDir works for both kinds and rejects empty dirs', () => {
  assert.deepEqual(runFromDir(WF_PROBE), { kind: 'workflow', id: 'wf_probe', project: '-fixture-project', dir: WF_PROBE });
  const sub = path.dirname(path.dirname(WF_PROBE));
  assert.deepEqual(runFromDir(sub), { kind: 'subagents', id: 'session-1', project: '-fixture-project', dir: sub });
  assert.equal(runFromDir(FIXTURES), null);
});

test('readRun on a real 2.1.282 workflow run', () => {
  const run = readRun(runFromDir(WF_PROBE));
  assert.equal(run.agents.length, 4);
  assert.deepEqual(run.agents.map(a => a.agentType).sort(), ['Explore', 'claude-code-guide', 'statusline-setup', 'workflow-subagent']);
  assert.deepEqual(run.versions, ['2.1.282']);
  assert.deepEqual(run.skipped, {});
  const def = run.agents.find(a => a.agentType === 'workflow-subagent');
  assert.equal(def.firstTurn.tokens, 45086);
  assert.equal(def.firstTurn.toolSizes, null, '2.1.282 does not log tool definitions');
  assert.ok(def.firstTurn.parts.skillListing > 0);
  const lean = run.agents.find(a => a.agentType === 'statusline-setup');
  assert.equal(lean.firstTurn.tokens, 8686);
  assert.equal(lean.firstTurn.parts.skillListing, 0);
  assert.equal(lean.firstTurn.parts.deferredTools, 0);
  assert.ok(run.agents.every(a => a.turns.some(t => t.calls.some(c => c.name === 'StructuredOutput'))), 'every agent returned structured output');
});

test('shellReadKeys: plain reader commands, resolved against the working directory', () => {
  const k = (cmd, cwd = '/repo') => shellReadKeys(cmd, cwd);
  assert.deepEqual(k('cat src/a.js src/B.js'), ['file:/repo/src/a.js', 'file:/repo/src/b.js']);
  assert.deepEqual(k('cat -n /abs/x.js'), ['file:/abs/x.js']);
  assert.deepEqual(k("sed -n '10,40p' lib/x.js"), ['file:/repo/lib/x.js']);
  assert.deepEqual(k("sed -e 's/a/b/' lib/x.js"), ['file:/repo/lib/x.js']);
  assert.deepEqual(k('head -n 50 README.md | grep foo'), ['file:/repo/readme.md']);
  assert.deepEqual(k('cd src && nl -ba cart.js'), ['file:/repo/src/cart.js']);
  assert.deepEqual(k('cd /other && tail -n 5 ../log.txt 2>/dev/null'), ['file:/log.txt']);
  assert.deepEqual(k('cat "my file.txt" > out.txt'), ['file:/repo/my file.txt']);
  assert.deepEqual(k('cat a.js 2>&1'), ['file:/repo/a.js']);
  assert.deepEqual(k('LANG=C cat a.js; cat a.js'), ['file:/repo/a.js']);
  assert.deepEqual(k('Get-Content C:\\Repo\\A.js -TotalCount 20', ''), ['file:c:/repo/a.js']);
  assert.equal(k('Get-Content C:\\Repo\\A.js', '')[0], readKey('Read', { file_path: 'C:\\Repo\\A.js' }), 'same key as a Read of the same file');
});

test('shellReadKeys: ignores anything that is not a plain read of a literal file', () => {
  const k = cmd => shellReadKeys(cmd, '/repo');
  assert.deepEqual(k('cat src/*.js'), []);
  assert.deepEqual(k('cat $FILE'), []);
  assert.deepEqual(k('echo hi > out.txt'), []);
  assert.deepEqual(k('grep -n foo src/a.js'), []);
  assert.deepEqual(k("sed -i 's/a/b/' src/a.js"), []);
  assert.deepEqual(k('npm test'), []);
  assert.deepEqual(k(''), []);
  assert.deepEqual(shellReadKeys('cat a.js', ''), [], 'a relative path needs a working directory');
});

test('parseAgent: Bash reads become shell keys; duplicate reads count them', () => {
  const line = (id, cmd) => JSON.stringify({ type: 'assistant', cwd: '/repo', timestamp: '2026-09-01T10:00:00Z',
    message: { id, usage: { input_tokens: 1 }, content: [{ type: 'tool_use', id: id + 't', name: 'Bash', input: { command: cmd } }] } });
  const a = parseAgent(line('m1', 'cat -n src/cart.js'), {});
  assert.deepEqual(a.turns[0].calls[0], { name: 'Bash', key: null, shellKeys: ['file:/repo/src/cart.js'] });
});
