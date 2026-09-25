#!/usr/bin/env node
// Copy a run directory with its content removed, for use as a test fixture.
// Keeps structure, keys, numbers, booleans, timestamps, ids, models, tool names and the length
// of every string. Replaces text with "x" and paths, URLs and search patterns with stable
// placeholders, so duplicate reads still match.
//
//   node scripts/scrub-fixture.js <run-dir> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEEP = new Set([
  'type', 'name', 'model', 'version', 'timestamp', 'id', 'uuid', 'parentUuid', 'agentId', 'sessionId',
  'promptId', 'requestId', 'tool_use_id', 'toolUseId', 'role', 'stop_reason', 'stop_sequence', 'agentType',
  'workflowPhase', 'userType', 'entrypoint', 'service_tier', 'speed', 'inference_geo', 'operation', 'subtype',
  'level', 'contextRendering', 'requestShape', 'key', 'phase', 'sourceToolAssistantUUID', 'effort', 'perTurnEffort',
]);
const PLACEHOLDER = { file_path: 'path', path: 'path', notebook_path: 'path', cwd: 'path', url: 'url', pattern: 'pattern', gitBranch: 'branch' };

export function makeScrubber() {
  const seen = new Map();
  const placeholder = (kind, value) => {
    const k = kind + '\u0000' + value;
    if (!seen.has(k)) {
      const n = [...seen.keys()].filter(x => x.startsWith(kind + '\u0000')).length + 1;
      seen.set(k, kind === 'url' ? `https://example.test/${n}` : kind === 'path' ? `/fixture/path-${n}` : `${kind}-${n}`);
    }
    return seen.get(k);
  };
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (KEEP.has(key)) return v;
      if (PLACEHOLDER[key]) return placeholder(PLACEHOLDER[key], v);
      return 'x'.repeat(v.length);
    }
    if (Array.isArray(v)) return v.map(x => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk;
}

export function scrubText(text, walk, ext) {
  if (ext === '.json') {
    const meta = JSON.parse(text);
    const out = walk(meta, null);
    // A workflow agent label in .meta.json looks like "stage: detail"; keep the stage.
    if (typeof meta.description === 'string') {
      const i = meta.description.indexOf(':');
      if (i > 0) out.description = meta.description.slice(0, i) + ':' + 'x'.repeat(meta.description.length - i - 1);
    }
    return JSON.stringify(out) + '\n';
  }
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    try { return JSON.stringify(walk(JSON.parse(line), null)); } catch { return 'x'.repeat(line.length); }
  }).join('\n');
}

export function scrubDir(src, dest, walk = makeScrubber()) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name), to = path.join(dest, e.name);
    if (e.isDirectory()) scrubDir(from, to, walk);
    else if (/\.(jsonl|json)$/.test(e.name)) fs.writeFileSync(to, scrubText(fs.readFileSync(from, 'utf8'), walk, path.extname(e.name)));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) { console.error('usage: scrub-fixture.js <run-dir> <out-dir>'); process.exit(2); }
  scrubDir(src, dest);
  console.log(`scrubbed ${src} -> ${dest}`);
}
