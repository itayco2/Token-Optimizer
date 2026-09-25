// Markdown and JSON output. The report never prints prompt or output text; project names,
// paths and URLs appear only with showPaths.
import { PRICES_AS_OF } from './prices.js';
import { ROLES } from './roles.js';

export function fmtTokens(n) {
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

export function fmtPct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  return (100 * x).toFixed(digits) + '%';
}

const fmtDuration = ms => (ms >= 3.6e6 ? (ms / 3.6e6).toFixed(1) + ' h' : (ms / 6e4).toFixed(1) + ' min');
const fmtUsd = n => '$' + (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const fmtDate = t => (t === null || t === undefined ? '?' : new Date(t).toISOString().slice(0, 10));
const fmtRange = (lo, hi, f) => (f(lo) === f(hi) ? f(lo) : `${f(lo)}–${f(hi)}`);
const table = (head, rows) => [
  '| ' + head.join(' | ') + ' |',
  '|' + head.map((_, i) => (i === 0 ? '---' : '---:')).join('|') + '|',
  ...rows.map(r => '| ' + r.join(' | ') + ' |'),
].join('\n');

const PART_NAMES = {
  systemPrompt: 'System prompt',
  tools: 'Tool definitions',
  notInLog: 'Not in the log (mostly tool definitions)',
  instructions: 'Instruction files (CLAUDE.md)',
  memory: 'MEMORY files',
  rules: 'Rules files',
  skillListing: 'Skill listing',
  deferredTools: 'Deferred-tool listing',
  task: 'Task',
  otherAttachments: 'Other attachments',
};

function runLabel(r, showPaths) {
  const id = r.kind === 'workflow' ? r.id : `${r.id.slice(0, 8)} (subagents)`;
  return showPaths && r.project ? `${r.project}/${id}` : id;
}

export function markdown(s, opts = {}) {
  const { showPaths = false, top = 15 } = opts;
  const out = [];
  const tokenKinds = [
    ['Cache read', 'cacheRead'], ['Cache write', 'cacheWrite'], ['Uncached input', 'uncached'], ['Output', 'output'],
  ];
  const allTokens = s.read + s.written;

  out.push(`# X-ray: ${s.runCount} runs, ${s.agentCount.toLocaleString('en-US')} agents, ${s.turns.toLocaleString('en-US')} turns`);
  out.push(`${fmtDate(s.from)} to ${fmtDate(s.to)}`);

  out.push('## Summary');
  out.push([
    `- **Tokens read:** ${fmtTokens(s.read)}. **Written:** ${fmtTokens(s.written)} (${fmtPct(s.written / Math.max(1, s.read), 3)} of read).`,
    `- **Fixed start of each turn:** ${fmtPct(s.fixedShare)} of all tokens read (median run ${fmtPct(s.fixedShareMedianRun)}). This is what every agent loads before its task and re-reads on every turn.`,
    `- **Re-reading cached context:** ${fmtPct(s.rereadCostShareMedianRun)} of price-weighted cost (median run).`,
    `- **Same file or URL read by 2+ agents in one run:** median ${fmtPct(s.dupShareMedianRun)} of reads, counting files printed by shell commands (${fmtPct(s.dupToolOnlyShareMedianRun)} counting only Read, WebFetch, Grep and Glob); ${s.runsDup30} of ${s.runCount} runs at 30% or more.`,
    `- **API-price equivalent:** about ${fmtUsd(s.costTotal)} at list prices (${PRICES_AS_OF}). On a subscription this is a comparison unit, not a bill.`,
    `- **Lean roles would save:** about ${fmtRange(s.lean.lowShare, s.lean.highShare, fmtPct)} of tokens read (${fmtRange(s.lean.low, s.lean.high, fmtTokens)}). See "What you could cut".`,
  ].join('\n'));

  out.push('## Tokens by kind');
  out.push(table(['Kind', 'Tokens', 'Share of tokens', 'Share of cost'], tokenKinds.map(([name, k]) => [
    name, fmtTokens(s.tokens[k]), fmtPct(s.tokens[k] / Math.max(1, allTokens), 1), fmtPct(s.cost[k] / Math.max(1e-9, s.costTotal), 1),
  ])));

  out.push('## Fixed start by agent type');
  out.push(table(['Agent type', 'Agents', 'Median first turn', 'Median turns', 'Fixed share of tokens read'], s.agentTypes.slice(0, top).map(t => [
    t.type, String(t.agents), fmtTokens(t.medianFirstTurn), String(t.medianTurns ?? '–'), fmtPct(t.fixedShare),
  ])));

  const withMakeup = s.agentTypes.filter(t => t.makeup).slice(0, 3);
  if (withMakeup.length) {
    out.push('## What fills the first turn');
    out.push('Median tokens per agent. Where the log holds tool definitions (CLI 2.1.250 and nearby), the billed first-turn total is split by each part\'s share of characters. ' +
      'Where it doesn\'t (newer versions), logged parts are estimated from their length and the rest is shown as "not in the log".');
    const keys = Object.keys(PART_NAMES).filter(k => withMakeup.some(t => (t.makeup[k] || 0) >= 1));
    out.push(table(['Part', ...withMakeup.map(t => t.type)], keys.map(k => [
      PART_NAMES[k], ...withMakeup.map(t => fmtTokens(t.makeup[k] || 0)),
    ])));
  }

  out.push('## Tool use');
  out.push(`Share of agents that called each tool at least once${s.loadedKnownFor ? ` (loaded tools are logged for ${s.loadedKnownFor} agents)` : ''}.`);
  const toolRows = s.toolUse.slice(0, top).map(t => [t.tool, String(t.agents), fmtPct(t.share, 1)]);
  toolRows.push(['Any browser tool', '', fmtPct(s.browserShare, 1)]);
  out.push(table(['Tool', 'Agents', 'Share'], toolRows));
  if (s.neverCalled.length) {
    out.push('Loaded but never called: ' + s.neverCalled.slice(0, top).map(t => `${t.tool} (${t.loadedBy} agents)`).join(', ') + '.');
  }

  out.push('## Where the time went');
  const timeRows = Object.entries(s.time).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => [k === 'model' ? 'Model' : k.replace(/^tool:/, ''), fmtDuration(v), fmtPct(v / Math.max(1, s.timeTotal), 1)]);
  out.push(table(['Spent on', 'Agent time', 'Share'], timeRows));
  out.push(`${fmtPct(s.oneCallShare)} of turns made exactly one tool call; ${s.callsPerTurn.toFixed(2)} calls per turn; about ${Math.round(s.secondsPerTurn)} s per turn; median ${s.medianTurnsPerAgent ?? '–'} turns per agent.`);

  out.push('## Models');
  const modelTurns = Object.values(s.models).reduce((a, b) => a + b, 0);
  out.push(table(['Model', 'Turns', 'Share'], Object.entries(s.models).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([m, n]) => [m, n.toLocaleString('en-US'), fmtPct(n / Math.max(1, modelTurns), 1)])));
  out.push(`${s.runsOpus95} of ${s.runCount} runs ran 95% or more of their turns on Opus.`);

  out.push('## What you could cut');
  out.push('Each lean role loads only the tools it lists, which also drops the skill listing and the deferred-tool listing. ' +
    'The saving is re-read on every turn, so it counts once per turn. A range means the log does not hold the tool definitions.' +
    (s.lean.floor > 0 ? ` The high end leaves out ${fmtTokens(s.lean.floor)}, what your agents that already have an allowlist still start with outside the log.` : ''));
  out.push(table(['Agent type', 'Agents', 'Fits role', 'Median start', 'Saved per turn', 'Tokens read saved'], s.agentTypes.slice(0, top).map(t => [
    t.type,
    String(t.agents),
    t.topRole ? `${t.topRole.role} (${fmtPct(t.topRole.share)})` : '–',
    fmtTokens(t.medianFirstTurn),
    fmtRange(t.medianSaving.low, t.medianSaving.high, fmtTokens),
    fmtRange(t.savedRead.low, t.savedRead.high, fmtTokens),
  ])));
  out.push('Roles: ' + ROLES.map(r => `**${r.name}** (${r.tools.join(', ')})`).join(', ') + '. "none" means the agent called a tool no role has.');

  out.push('## Runs');
  const runRows = [...s.runs].sort((a, b) => b.read - a.read).slice(0, top).map(r => [
    runLabel(r, showPaths), String(r.agentCount), String(r.turns), fmtTokens(r.read), fmtPct(r.fixedShare), fmtPct(r.rereadCostShare), fmtPct(r.dup.share), r.wallMinutes.toFixed(0),
  ]);
  out.push(table(['Run', 'Agents', 'Turns', 'Read', 'Fixed', 'Re-read cost', 'Dup reads', 'Minutes'], runRows));
  if (s.runs.length > top) out.push(`Showing the ${top} largest of ${s.runs.length} runs. Use --top to see more, or --json for all.`);

  const skipped = Object.entries(s.skipped).map(([k, v]) => `${v} ${k}`).join(', ');
  out.push('---');
  out.push(`Read with lean-swarm xray. Claude Code versions in these logs: ${s.versions.join(', ') || 'unknown'}. ` +
    `Lines skipped: ${skipped || 'none'}.` + (s.unpricedTurns ? ` ${s.unpricedTurns} turns on models without a known price were priced like Opus 5.` : '') +
    ' Method: docs/method.md.');
  return out.join('\n\n') + '\n';
}

// JSON view: everything in the summary, minus Sets and per-agent detail unless asked.
export function json(s, opts = {}) {
  const { showPaths = false } = opts;
  const clean = {
    ...s,
    runs: s.runs.map(r => ({
      ...r,
      project: showPaths ? r.project : undefined,
      dir: showPaths ? r.dir : undefined,
      agents: r.agents.map(a => ({ ...a, called: [...a.called], keys: undefined, toolKeys: undefined })),
    })),
  };
  return JSON.stringify(clean, null, 2) + '\n';
}

export function compareMarkdown(rows, a, b) {
  const out = [];
  out.push(`# X-ray compare: ${a.runCount} runs (A) vs ${b.runCount} runs (B)`);
  const fmt = (name, v) => {
    if (v === null || v === undefined) return '–';
    if (/share/i.test(name)) return fmtPct(v);
    if (/USD/.test(name)) return fmtUsd(v);
    if (/min\)|Runs|errors|Agents|Turns/.test(name)) return Number.isInteger(v) ? String(v) : v.toFixed(1);
    return fmtTokens(v);
  };
  out.push(table(['Measure', 'A', 'B', 'Change'], rows.map(r => [
    r.name, fmt(r.name, r.a), fmt(r.name, r.b), r.change === null ? '–' : (r.change > 0 ? '+' : '') + fmtPct(r.change),
  ])));
  const typesOf = s => s.agentTypes.map(t => `${t.type} ×${t.agents}`).join(', ');
  out.push(`A agent types: ${typesOf(a)}.\n\nB agent types: ${typesOf(b)}.`);
  return out.join('\n\n') + '\n';
}
