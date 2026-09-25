#!/usr/bin/env node
// Score proof runs against the planted-bug key.
//   node proof/score.js <workflow-run-dir> [...]
// A run dir is the "Transcript dir" the Workflow tool prints. It holds journal.jsonl and agent-*.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../src/roles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KEY = JSON.parse(fs.readFileSync(path.join(HERE, 'grading', 'key.json'), 'utf8'));

const ROLE_TYPES = new Set(ROLES.flatMap(r => [r.name, 'lean-swarm:' + r.name]));
const norm = f => String(f || '').split('\\').join('/').replace(/^\.\//, '');
const sameFile = (reported, keyFile) => {
  const r = norm(reported);
  return r === keyFile || r.endsWith('/' + keyFile) || path.posix.basename(r) === path.posix.basename(keyFile);
};

// Each planted bug matches at most one finding (the closest line in the same file) and vice versa.
export function scoreFindings(findings, key = KEY) {
  const free = new Set(findings.map((_, i) => i));
  const matched = [];
  const missed = [];
  for (const bug of key.bugs) {
    let best = null;
    for (const i of free) {
      const f = findings[i];
      if (!sameFile(f.file, bug.file)) continue;
      const d = Math.abs(Number(f.line) - bug.line);
      if (d <= key.window && (best === null || d < best.d)) best = { i, d };
    }
    if (best) { free.delete(best.i); matched.push({ bug: bug.id, finding: findings[best.i] }); } else missed.push(bug.id);
  }
  return { recall: matched.length / key.bugs.length, matched, missed, other: [...free].map(i => findings[i]) };
}

function jsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export function readProofRun(dir) {
  const journal = jsonl(path.join(dir, 'journal.jsonl'));
  const labels = Object.fromEntries(journal.filter(e => e.type === 'started').map(e => [e.agentId, e.label]));
  const report = journal.filter(e => e.type === 'result' && labels[e.agentId] === 'report').pop();
  const agentFiles = fs.readdirSync(dir).filter(f => /^agent-.*\.jsonl$/.test(f));
  let lean = false, touchedKey = false;
  for (const f of agentFiles) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
      if (ROLE_TYPES.has(meta.agentType)) lean = true;
    } catch { /* no meta */ }
    for (const e of jsonl(path.join(dir, f))) {
      if (e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue;
      for (const c of e.message.content) {
        if (c && c.type === 'tool_use' && /grading|key\.json/.test(JSON.stringify(c.input || {}))) touchedKey = true;
      }
    }
  }
  return {
    dir,
    variant: lean ? 'lean' : 'plain',
    findings: report && report.result && Array.isArray(report.result.findings) ? report.result.findings : null,
    agents: agentFiles.length,
    touchedKey,
  };
}

export function scoreTable(runs) {
  const rows = runs.map(r => {
    if (!r.findings) return `| ${path.basename(r.dir)} | ${r.variant} | no report found | | | | ${r.touchedKey ? 'yes' : 'no'} |`;
    const s = scoreFindings(r.findings);
    return `| ${path.basename(r.dir)} | ${r.variant} | ${s.matched.length}/${KEY.bugs.length} | ${s.matched.map(m => m.bug).join(', ') || '–'} | ${s.missed.join(', ') || '–'} | ${s.other.length} | ${r.touchedKey ? 'yes' : 'no'} |`;
  });
  return [
    '| Run | Variant | Planted bugs found | Found | Missed | Other findings | Touched answer key |',
    '|---|---|---:|---|---|---:|---|',
    ...rows,
  ].join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node proof/score.js <workflow-run-dir> [...]'); process.exit(2); }
  process.stdout.write(scoreTable(dirs.map(readProofRun)));
}
