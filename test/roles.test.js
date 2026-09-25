import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fitRole, normalizeCalled, ROLES } from '../src/roles.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  assert.ok(m, `${file} has frontmatter`);
  const fields = Object.fromEntries(m[1].split(/\r?\n/).map(l => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  return { fields, body: m[2].trim() };
}

test('fitRole picks the leanest role that covers what the agent called', () => {
  assert.equal(fitRole(['Read', 'StructuredOutput']).name, 'judge');
  assert.equal(fitRole(['Read', 'Grep']).name, 'reader');
  assert.equal(fitRole(['Read', 'Bash']).name, 'reviewer');
  assert.equal(fitRole(['WebFetch', 'ToolSearch']).name, 'researcher');
  assert.equal(fitRole(['Edit', 'Bash']).name, 'coder');
  assert.equal(fitRole([]).name, 'judge');
  assert.equal(fitRole(['Read', 'Agent']), null);
  assert.equal(fitRole(['WebFetch', 'Edit']), null);
});

test('PowerShell counts as Bash; StructuredOutput, SubagentHandback and ToolSearch are ignored', () => {
  assert.deepEqual([...normalizeCalled(['PowerShell', 'StructuredOutput', 'SubagentHandback', 'ToolSearch', 'Read'])], ['Bash', 'Read']);
  assert.equal(fitRole(['PowerShell', 'Read']).name, 'reviewer');
});

test('agents/*.md match src/roles.js', () => {
  const files = fs.readdirSync(path.join(ROOT, 'agents')).filter(f => f.endsWith('.md')).sort();
  assert.deepEqual(files, ROLES.map(r => r.name + '.md').sort());
  for (const role of ROLES) {
    const { fields, body } = frontmatter(path.join(ROOT, 'agents', role.name + '.md'));
    assert.equal(fields.name, role.name);
    assert.deepEqual(fields.tools.split(',').map(s => s.trim()), role.tools, `${role.name} tools`);
    assert.equal(fields.model, 'inherit');
    assert.ok(fields.description.length > 40, `${role.name} has a useful description`);
    assert.ok(body.split('.').length <= 4, `${role.name} prompt stays short and neutral`);
  }
});

test('plugin and marketplace manifests are valid and agree', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(plugin.name, 'lean-swarm');
  assert.ok(market.name && market.owner && market.owner.name);
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(market.plugins[0].source, './');
  assert.equal(market.plugins[0].version, plugin.version);
  assert.equal(pkg.version, plugin.version);
});
