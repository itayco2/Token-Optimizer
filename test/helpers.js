// Hand-built transcripts in the CLI 2.1.250 shape (prompt snapshot with tool definitions and an
// instructions attachment), with numbers small enough to check by hand.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'projects');
export const WF_PROBE = path.join(FIXTURES, '-fixture-project', 'session-1', 'subagents', 'workflows', 'wf_probe');

const T0 = Date.parse('2026-09-01T10:00:00.000Z');
const at = s => new Date(T0 + s * 1000).toISOString();
const V = '2.1.250';

const usage = (input, read, write, output, w1h = 0) => ({
  input_tokens: input,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  cache_creation: { ephemeral_5m_input_tokens: write - w1h, ephemeral_1h_input_tokens: w1h },
  output_tokens: output,
});

export const lines = arr => arr.map(x => JSON.stringify(x)).join('\n') + '\n';

// Agent A: 3 turns on Opus 4.7. Turn 1 is written as two lines with one message id.
export const AGENT_A = lines([
  { type: 'user', version: V, timestamp: at(0), message: { role: 'user', content: 'Review the diff' } },
  { type: 'attachment', version: V, timestamp: at(0), attachment: {
    type: 'prompt_snapshot',
    systemPrompt: ['S'.repeat(400)],
    tools: [
      { name: 'Read', description: 'r'.repeat(300) },
      { name: 'Artifact', description: 'a'.repeat(1300) },
      { name: 'Bash', description: 'b'.repeat(200) },
    ],
  } },
  { type: 'attachment', version: V, timestamp: at(0), attachment: {
    type: 'instructions',
    files: [
      { path: '/u/.claude/CLAUDE.md', content: 'c'.repeat(500) },
      { path: '/u/memory/MEMORY.md', content: 'm'.repeat(200) },
    ],
  } },
  { type: 'attachment', version: V, timestamp: at(0), attachment: { type: 'skill_listing', content: 'k'.repeat(1000) } },
  { type: 'attachment', version: V, timestamp: at(0), attachment: { type: 'deferred_tools_delta', addedNames: ['WebFetch'], addedLines: ['WebFetch'] } },
  { type: 'assistant', version: V, timestamp: at(2), message: { id: 'msg_1', model: 'claude-opus-4-7', usage: usage(10, 0, 5000, 50),
    content: [{ type: 'text', text: 'Looking.' }] } },
  { type: 'assistant', version: V, timestamp: at(2.5), message: { id: 'msg_1', model: 'claude-opus-4-7', usage: usage(10, 0, 5000, 120),
    content: [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: 'C:\\Repo\\A.js' } }] } },
  { type: 'user', version: V, timestamp: at(3), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'file text' }] } },
  { type: 'assistant', version: V, timestamp: at(10), message: { id: 'msg_2', model: 'claude-opus-4-7', usage: usage(5, 5010, 300, 80),
    content: [
      { type: 'tool_use', id: 'tu_2', name: 'Bash', input: { command: 'npm test' } },
      { type: 'tool_use', id: 'tu_3', name: 'Grep', input: { pattern: 'TODO', path: 'src' } },
    ] } },
  { type: 'user', version: V, timestamp: at(12), message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'tu_2', content: 'ok' },
    { type: 'tool_result', tool_use_id: 'tu_3', is_error: true, content: 'Error: No such tool available: Grep' },
  ] } },
  { type: 'assistant', version: V, timestamp: at(20), message: { id: 'msg_3', model: 'claude-opus-4-7', usage: usage(2, 5315, 100, 200, 100),
    content: [{ type: 'text', text: 'Done.' }] } },
]);

// Agent B: one turn on Sonnet 4.6 that reads the same file as A (different case and slashes).
export const AGENT_B = lines([
  { type: 'user', version: V, timestamp: at(1), message: { role: 'user', content: 'Check A' } },
  { type: 'assistant', version: V, timestamp: at(5), message: { id: 'msg_b1', model: 'claude-sonnet-4-6', usage: usage(3, 0, 4000, 10),
    content: [{ type: 'tool_use', id: 'tb_1', name: 'Read', input: { file_path: 'c:/repo/a.js' } }] } },
  { type: 'user', version: V, timestamp: at(6), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tb_1', content: 'file text' }] } },
]);

// Broken input: a truncated line, a line type X-ray doesn't know, and no model turn at all.
export const AGENT_BROKEN = [
  JSON.stringify({ type: 'user', timestamp: at(0), message: { role: 'user', content: 'hi' } }),
  JSON.stringify({ type: 'mystery', timestamp: at(1) }),
  '{"type":"assistant","message":{"id":"m',
].join('\r\n');

export const META_A = { agentType: 'code-reviewer', description: 'review: diff', workflowPhase: 'Review' };
export const META_B = { agentType: 'workflow-subagent', description: 'check: a' };

// Known values for agent A, worked out by hand.
export const A = {
  turns: 3,
  contexts: [5010, 5315, 5417],
  read: 15742,
  fixed: 5010 * 3,
  output: 120 + 80 + 200,
  parts: { systemPrompt: 400, tools: 304 + 1308 + 204, instructions: 500 + 12 + 20 + 19, memory: 200, rules: 0, skillListing: 13 + 1000, deferredTools: 20 + 8 + 8, task: 15, otherAttachments: 0 },
  time: { model: 2000 + 500 + 7000 + 8000, 'tool:Read': 500, 'tool:Bash': 2000 },
};
A.chars = Object.values(A.parts).reduce((x, y) => x + y, 0);
