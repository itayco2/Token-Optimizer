export const meta = {
  name: 'lean-swarm-roles-check',
  description: 'Check that each lean role starts lean and still returns structured output',
  phases: [{ title: 'Check', detail: 'one tiny task per role, plus a default agent to compare' }],
}

const RESULT = {
  type: 'object',
  properties: {
    tools: { type: 'array', items: { type: 'string' }, description: 'exact names of the tools you can call right now, not counting deferred ones' },
    ok: { type: 'boolean' },
  },
  required: ['tools', 'ok'],
}
const TASK = 'List the exact names of the tools you can call right now (not deferred ones you would have to load first), then return ok: true. Do nothing else.'
const AGENTS = [
  { label: 'default', opts: {} },
  ...['reader', 'researcher', 'coder', 'reviewer', 'judge'].map(r => ({ label: r, opts: { agentType: `lean-swarm:${r}` } })),
]

phase('Check')
const out = await parallel(AGENTS.map(a => () =>
  agent(TASK, { ...a.opts, label: `role:${a.label}`, phase: 'Check', schema: RESULT, effort: 'low' })))
return AGENTS.map((a, i) => ({ role: a.label, result: out[i] }))
