#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { defaultRoot, findRuns, readRun, runFromDir } from '../src/logs.js';
import { compare, summarize } from '../src/measure.js';
import { compareMarkdown, json, markdown } from '../src/report.js';

const HELP = `lean-swarm: see where your Claude Code multi-agent runs spend tokens and time

Usage:
  lean-swarm xray                         every run under ~/.claude/projects
  lean-swarm xray <run-dir> [...]         only these runs
  lean-swarm xray --compare <dirs> --vs <dirs>
                                          group A vs group B (comma-separated or repeated)

Options:
  --since YYYY-MM-DD   only runs that started on or after this date
  --root DIR           where to look instead of ~/.claude/projects
  --json               JSON instead of Markdown
  --show-paths         include project names and paths (off, so reports are safe to share)
  --top N              rows per table (default 15)
  --out FILE           write the report to FILE instead of stdout
  -h, --help           this help

X-ray only reads your logs. It changes nothing and sends nothing anywhere.`;

function fail(msg) {
  process.stderr.write(msg + '\n\n' + HELP + '\n');
  process.exit(2);
}

function loadRuns(dirs, root, since) {
  const runs = dirs.length
    ? dirs.map(d => runFromDir(d) || fail(`No agent-*.jsonl files in ${d}`))
    : findRuns(root);
  let parsed = runs.map(readRun);
  if (since) parsed = parsed.filter(r => r.start !== null && r.start >= since);
  return parsed;
}

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        since: { type: 'string' },
        root: { type: 'string' },
        json: { type: 'boolean' },
        'show-paths': { type: 'boolean' },
        top: { type: 'string' },
        out: { type: 'string' },
        compare: { type: 'string', multiple: true },
        vs: { type: 'string', multiple: true },
        all: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    fail(e.message);
  }
  const { values: v, positionals } = parsed;
  const [cmd, ...dirs] = positionals;
  if (v.help || !cmd) { process.stdout.write(HELP + '\n'); return; }
  if (cmd !== 'xray') fail(`Unknown command: ${cmd}`);

  const since = v.since ? Date.parse(v.since) : null;
  if (v.since && Number.isNaN(since)) fail(`Bad --since date: ${v.since}`);
  const top = v.top ? Number(v.top) : 15;
  if (!Number.isInteger(top) || top < 1) fail(`Bad --top: ${v.top}`);
  const root = v.root || defaultRoot();
  const opts = { showPaths: Boolean(v['show-paths']), top };

  let text;
  if (v.compare || v.vs) {
    const split = list => (list || []).flatMap(x => x.split(',')).map(x => x.trim()).filter(Boolean);
    const a = split(v.compare), b = split(v.vs);
    if (!a.length || !b.length) fail('--compare needs runs for both --compare and --vs');
    const sa = summarize(loadRuns(a, root, since));
    const sb = summarize(loadRuns(b, root, since));
    const rows = compare(sa, sb);
    text = v.json ? JSON.stringify({ rows }, null, 2) + '\n' : compareMarkdown(rows, sa, sb);
  } else {
    const runs = loadRuns(dirs, root, since);
    if (!runs.length) fail(`No multi-agent runs found under ${root}`);
    const s = summarize(runs);
    text = v.json ? json(s, opts) : markdown(s, opts);
  }
  if (v.out) fs.writeFileSync(v.out, text);
  else process.stdout.write(text);
}

main(process.argv.slice(2));
