// The only module that knows Claude Code's log format. Everything else works on what readRun returns.
//
// Layout under ~/.claude/projects:
//   <project>/<session>/subagents/agent-<id>.jsonl (+ .meta.json)                  plain Agent-tool subagents
//   <project>/<session>/subagents/workflows/<run>/agent-<id>.jsonl (+ .meta.json)  Workflow agents
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AGENT_FILE = /^agent-.*\.jsonl$/;

const KNOWN_TYPES = new Set([
  'user', 'assistant', 'attachment', 'system', 'summary', 'progress',
  'queue-operation', 'last-prompt', 'atis-latch', 'file-history-snapshot',
]);

// Gaps longer than this are a paused or sleeping machine, not work (same cap as the prototype).
const GAP_CAP_MS = 30 * 60 * 1000;

export function defaultRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function entries(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function agentFiles(dir) {
  return entries(dir).filter(e => e.isFile() && AGENT_FILE.test(e.name)).map(e => e.name).sort();
}

export function findRuns(root = defaultRoot()) {
  const runs = [];
  for (const proj of entries(root)) {
    if (!proj.isDirectory()) continue;
    const projDir = path.join(root, proj.name);
    for (const sess of entries(projDir)) {
      if (!sess.isDirectory()) continue;
      const sub = path.join(projDir, sess.name, 'subagents');
      if (agentFiles(sub).length) runs.push({ kind: 'subagents', id: sess.name, project: proj.name, dir: sub });
      const wfRoot = path.join(sub, 'workflows');
      for (const wf of entries(wfRoot)) {
        const dir = path.join(wfRoot, wf.name);
        if (wf.isDirectory() && agentFiles(dir).length) runs.push({ kind: 'workflow', id: wf.name, project: proj.name, dir });
      }
    }
  }
  return runs;
}

// A run given by path on the command line.
export function runFromDir(dir) {
  const abs = path.resolve(dir);
  if (!agentFiles(abs).length) return null;
  const up = n => { let d = abs; for (let i = 0; i < n; i++) d = path.dirname(d); return path.basename(d); };
  if (path.basename(path.dirname(abs)) === 'workflows') return { kind: 'workflow', id: path.basename(abs), project: up(4), dir: abs };
  return { kind: 'subagents', id: up(1), project: up(2), dir: abs };
}

// Characters of text in a value: the sum of every string inside it (keys excluded).
export function strLen(v) {
  if (typeof v === 'string') return v.length;
  if (Array.isArray(v)) return v.reduce((a, x) => a + strLen(x), 0);
  if (v && typeof v === 'object') return Object.values(v).reduce((a, x) => a + strLen(x), 0);
  return 0;
}

// What a tool call read, so reads of the same thing by different agents can be matched.
// Same keys as the prototype (wfall.js).
export function readKey(name, input) {
  if (!input || typeof input !== 'object') return null;
  if (name === 'Read') return 'file:' + String(input.file_path || '').toLowerCase().split('\\').join('/');
  if (name === 'WebFetch') return 'url:' + String(input.url || '').replace(/[#?].*$/, '').replace(/\/$/, '');
  if (name === 'Grep') return 'grep:' + input.pattern + '@' + (input.path || '');
  if (name === 'Glob') return 'glob:' + input.pattern + '@' + (input.path || '');
  return null;
}

function usageOf(u) {
  u = u || {};
  const c = u.cache_creation || {};
  return {
    input: u.input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheWrite5m: c.ephemeral_5m_input_tokens || 0,
    cacheWrite1h: c.ephemeral_1h_input_tokens || 0,
    output: u.output_tokens || 0,
  };
}

function fileKind(p) {
  const s = String(p || '').split('\\').join('/');
  if (/(^|\/)MEMORY\.md$/i.test(s) || /\/memory\//i.test(s)) return 'memory';
  if (/\/rules\//i.test(s)) return 'rules';
  return 'instructions';
}

function isInstructionAttachment(a) {
  return a.type === 'instructions' || /claude_?md|nested_memory/i.test(a.type) || (Array.isArray(a.files) && a.files.some(f => f && 'content' in f));
}

function firstTurnMakeup(lines, firstIdx, usage) {
  const parts = {
    systemPrompt: 0, tools: 0, instructions: 0, memory: 0, rules: 0,
    skillListing: 0, deferredTools: 0, task: 0, otherAttachments: 0,
  };
  let toolSizes = null;
  let deferredNames = null;
  const files = [];

  const snap = lines.find(e => e.type === 'attachment' && e.attachment && e.attachment.type === 'prompt_snapshot');
  if (snap) {
    parts.systemPrompt = strLen(snap.attachment.systemPrompt);
    const tools = snap.attachment.tools;
    if (Array.isArray(tools) && tools.length) {
      toolSizes = {};
      for (const t of tools) {
        const name = (t && t.name) || '?';
        toolSizes[name] = (toolSizes[name] || 0) + strLen(t);
      }
      parts.tools = Object.values(toolSizes).reduce((a, b) => a + b, 0);
    }
  }

  const before = lines.slice(0, firstIdx);
  const task = before.find(e => e.type === 'user' && e.message);
  parts.task = task ? strLen(task.message.content) : 0;

  for (const e of before) {
    if (e.type !== 'attachment' || !e.attachment) continue;
    const a = e.attachment;
    if (a.type === 'prompt_snapshot') continue;
    if (a.type === 'skill_listing') parts.skillListing += strLen(a);
    else if (a.type === 'deferred_tools_delta') {
      parts.deferredTools += strLen(a);
      deferredNames = [...(deferredNames || []), ...(a.addedNames || [])];
    } else if (isInstructionAttachment(a)) {
      let inFiles = 0;
      for (const f of a.files || []) {
        const kind = fileKind(f.path);
        const n = strLen(f.content);
        parts[kind] += n;
        inFiles += n;
        files.push({ kind, path: String(f.path || ''), chars: n });
      }
      parts.instructions += Math.max(0, strLen(a) - inFiles);
    } else parts.otherAttachments += strLen(a);
  }

  return {
    tokens: usage.input + usage.cacheRead + usage.cacheWrite,
    parts,
    toolSizes,
    files,
    loaded: { direct: toolSizes ? Object.keys(toolSizes) : null, deferred: deferredNames },
  };
}

export function parseAgent(text, meta = {}, id = '') {
  const skipped = {};
  const skip = r => { skipped[r] = (skipped[r] || 0) + 1; };

  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let e;
    try { e = JSON.parse(raw); } catch { skip('unparseable line'); continue; }
    if (!e || typeof e !== 'object' || Array.isArray(e)) { skip('line is not an object'); continue; }
    if (!KNOWN_TYPES.has(e.type)) skip('unknown line type');
    lines.push(e);
  }

  const versions = new Set();
  const turns = [];
  const byId = new Map();
  const toolNames = new Map();
  const toolErrors = { total: 0, unknownTool: 0 };
  let firstIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    if (e.version) versions.add(e.version);
    const m = e.message;
    if (e.type === 'assistant') {
      if (!m || typeof m !== 'object') { skip('assistant line without message'); continue; }
      if (firstIdx < 0) firstIdx = i;
      // One model turn is written as several lines sharing a message id.
      const mid = m.id || e.uuid || `line-${i}`;
      let turn = byId.get(mid);
      if (!turn) {
        turn = { id: mid, model: m.model || null, hasUsage: Boolean(m.usage), usage: usageOf(m.usage), calls: [] };
        byId.set(mid, turn);
        turns.push(turn);
      } else if (m.usage) {
        if (!turn.hasUsage) { turn.usage = usageOf(m.usage); turn.hasUsage = true; }
        turn.usage.output = Math.max(turn.usage.output, m.usage.output_tokens || 0);
      }
      if (!turn.model && m.model) turn.model = m.model;
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (!c || c.type !== 'tool_use') continue;
        turn.calls.push({ name: c.name, key: readKey(c.name, c.input) });
        toolNames.set(c.id, c.name);
      }
    } else if (e.type === 'user' && m && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (!c || c.type !== 'tool_result' || !c.is_error) continue;
        toolErrors.total++;
        if (/no such tool|tool .*not available|unknown tool/i.test(JSON.stringify(c.content || ''))) toolErrors.unknownTool++;
      }
    }
  }

  // Time split, same method as the prototype (timeuse.js): each gap between timestamped lines
  // goes to what the later line is. A model reply means model time; a tool result means that tool.
  const timed = lines.filter(e => e.timestamp && !Number.isNaN(Date.parse(e.timestamp)));
  const time = {};
  for (let i = 1; i < timed.length; i++) {
    const gap = Date.parse(timed[i].timestamp) - Date.parse(timed[i - 1].timestamp);
    if (gap < 0 || gap > GAP_CAP_MS) continue;
    const e = timed[i];
    let cat = 'other';
    if (e.type === 'assistant') cat = 'model';
    else if (e.type === 'user' && e.message && Array.isArray(e.message.content)) {
      const tr = e.message.content.find(c => c && c.type === 'tool_result');
      if (tr) cat = 'tool:' + (toolNames.get(tr.tool_use_id) || '?');
    }
    time[cat] = (time[cat] || 0) + gap;
  }

  const firstTurn = firstIdx >= 0 && turns[0].hasUsage ? firstTurnMakeup(lines, firstIdx, turns[0].usage) : null;

  return {
    id,
    agentType: meta.agentType || null,
    label: meta.description || null,
    phase: meta.workflowPhase || null,
    versions: [...versions],
    turns,
    time,
    toolErrors,
    firstTurn,
    start: timed.length ? Date.parse(timed[0].timestamp) : null,
    end: timed.length ? Date.parse(timed[timed.length - 1].timestamp) : null,
    skipped,
  };
}

function addCounts(into, from) {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] || 0) + v;
}

export function readRun(run) {
  const agents = [];
  const skipped = {};
  for (const f of agentFiles(run.dir)) {
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(run.dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch { /* meta is optional */ }
    let text;
    try { text = fs.readFileSync(path.join(run.dir, f), 'utf8'); } catch { addCounts(skipped, { 'unreadable agent file': 1 }); continue; }
    const agent = parseAgent(text, meta, f.replace(/^agent-/, '').replace(/\.jsonl$/, ''));
    addCounts(skipped, agent.skipped);
    agents.push(agent);
  }
  const starts = agents.map(a => a.start).filter(x => x !== null);
  const ends = agents.map(a => a.end).filter(x => x !== null);
  return {
    ...run,
    agents,
    skipped,
    versions: [...new Set(agents.flatMap(a => a.versions))].sort(),
    start: starts.length ? Math.min(...starts) : null,
    end: ends.length ? Math.max(...ends) : null,
  };
}
