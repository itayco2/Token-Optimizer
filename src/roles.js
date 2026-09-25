// The lean roles shipped in agents/*.md. A test keeps this list and the files in sync.
// Ordered from fewest tools to most, so the first role that fits is the leanest.
export const ROLES = [
  { name: 'judge', tools: ['Read'] },
  { name: 'reader', tools: ['Read', 'Grep', 'Glob'] },
  { name: 'reviewer', tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  { name: 'researcher', tools: ['WebSearch', 'WebFetch', 'Read', 'Grep', 'Glob', 'Bash'] },
  { name: 'coder', tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'] },
];

// Tools a role never needs to list: StructuredOutput is added for workflow schemas,
// SubagentHandback is how a plain subagent returns its result, and ToolSearch only loads
// deferred tools, which a role names directly instead.
const IGNORED = new Set(['StructuredOutput', 'SubagentHandback', 'ToolSearch']);

// A role's Bash covers what an agent did with PowerShell on Windows.
const EQUIVALENT = { PowerShell: 'Bash' };

export function normalizeCalled(tools) {
  const out = new Set();
  for (const t of tools) {
    if (IGNORED.has(t)) continue;
    out.add(EQUIVALENT[t] || t);
  }
  return out;
}

// The leanest role whose tools cover every tool the agent called, or null.
export function fitRole(calledTools) {
  const need = normalizeCalled(calledTools);
  return ROLES.find(r => [...need].every(t => r.tools.includes(t))) || null;
}
