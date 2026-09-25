#!/usr/bin/env node
// Where the time went in proof runs, per stage, to explain wall-clock differences.
//   node proof/timing.js <workflow-run-dir> [...]
import { fileURLToPath } from 'node:url';
import { readRun, runFromDir } from '../src/logs.js';
import { median } from '../src/measure.js';
import { ROLES } from '../src/roles.js';

const ROLE_TYPES = new Set(ROLES.flatMap(r => [r.name, 'lean-swarm:' + r.name]));
const sec = ms => (ms / 1000).toFixed(1);

// Per agent: stage, duration, turns, model and tool time, output, and whether its first turn
// found the start already cached (warm) or had to write it (cold).
export function agentTiming(a) {
  const stage = String(a.label || '?').split(':')[0];
  const u0 = a.turns.length ? a.turns[0].usage : null;
  const first = u0 ? u0.input + u0.cacheRead + u0.cacheWrite : 0;
  const toolMs = Object.entries(a.time).filter(([k]) => k.startsWith('tool:')).reduce((x, [, v]) => x + v, 0);
  return {
    stage,
    lean: ROLE_TYPES.has(a.agentType),
    ms: a.start !== null && a.end !== null ? a.end - a.start : 0,
    turns: a.turns.length,
    modelMs: a.time.model || 0,
    toolMs,
    output: a.turns.reduce((x, t) => x + t.usage.output, 0),
    thinking: a.turns.reduce((x, t) => x + (t.usage.thinking || 0), 0),
    first,
    firstCachedShare: first ? u0.cacheRead / first : 0,
    tools: a.turns.flatMap(t => t.calls.map(c => c.name)),
  };
}

export function runTiming(run) {
  const agents = run.agents.map(agentTiming);
  const byStage = {};
  for (const a of agents) (byStage[a.stage] = byStage[a.stage] || []).push(a);
  return {
    id: run.id,
    variant: agents.some(a => a.lean) ? 'lean' : 'plain',
    wallMs: run.start !== null && run.end !== null ? run.end - run.start : 0,
    stages: Object.fromEntries(Object.entries(byStage).map(([s, list]) => [s, {
      agents: list.length,
      medianMs: median(list.map(a => a.ms)),
      maxMs: Math.max(...list.map(a => a.ms)),
      turns: list.reduce((x, a) => x + a.turns, 0),
      modelMs: list.reduce((x, a) => x + a.modelMs, 0),
      toolMs: list.reduce((x, a) => x + a.toolMs, 0),
      output: list.reduce((x, a) => x + a.output, 0),
      thinking: list.reduce((x, a) => x + a.thinking, 0),
      medianFirst: median(list.map(a => a.first)),
      medianFirstCached: median(list.map(a => a.firstCachedShare)),
    }])),
    toolCounts: agents.flatMap(a => a.tools).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {}),
  };
}

export function timingTable(timings) {
  const rows = [];
  for (const t of timings) {
    for (const [stage, s] of Object.entries(t.stages)) {
      rows.push(`| ${t.id} | ${t.variant} | ${sec(t.wallMs)} | ${stage} | ${s.agents} | ${sec(s.medianMs)} | ${sec(s.maxMs)} | ${s.turns} | ${s.turns ? sec(s.modelMs / s.turns) : '–'} | ${sec(s.toolMs)} | ${s.output} | ${s.thinking} | ${Math.round(s.medianFirst / 100) / 10}k | ${Math.round(100 * s.medianFirstCached)}% |`);
    }
  }
  const tools = timings.map(t => `- ${t.id} (${t.variant}): ${Object.entries(t.toolCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
  return [
    '| Run | Variant | Wall (s) | Stage | Agents | Median agent (s) | Slowest agent (s) | Turns | Model s/turn | Tool time (s) | Output tokens | of which thinking | Median first turn | First turn cached |',
    '|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    'Tool calls per run:',
    ...tools,
  ].join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node proof/timing.js <workflow-run-dir> [...]'); process.exit(2); }
  const runs = dirs.map(d => runFromDir(d) || (console.error(`No agent-*.jsonl files in ${d}`), process.exit(2)));
  process.stdout.write(timingTable(runs.map(r => runTiming(readRun(r)))));
}

