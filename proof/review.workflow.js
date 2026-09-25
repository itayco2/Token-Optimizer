export const meta = {
  name: 'lean-swarm-proof-review',
  description: 'Proof run: review a small library with planted bugs, as plain or lean agents',
  whenToUse: 'Run with args {variant: "plain" | "lean", target: "<absolute path to proof/target>"}',
  phases: [
    { title: 'Find', detail: 'three reviewers, one lens each' },
    { title: 'Verify', detail: 'one checker per reviewer' },
    { title: 'Report', detail: 'one judge merges the confirmed bugs' },
  ],
}

// The only difference between the two variants is the agent type.
const variant = args && args.variant
const target = args && args.target
if (variant !== 'plain' && variant !== 'lean') throw new Error('args.variant must be "plain" or "lean"')
if (!target) throw new Error('args.target must be the absolute path of proof/target')
const REVIEWER = variant === 'lean' ? { agentType: 'lean-swarm:reviewer' } : {}
const JUDGE = variant === 'lean' ? { agentType: 'lean-swarm:judge' } : {}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'path relative to the library root, e.g. src/cart.js' },
          line: { type: 'integer', description: 'line number of the faulty code' },
          title: { type: 'string' },
          why: { type: 'string', description: 'one sentence: what is wrong' },
        },
        required: ['file', 'line', 'title', 'why'],
      },
    },
  },
  required: ['findings'],
}

const SCOPE = `The library is in ${target}. The JSDoc on each function is its spec: code that does something different from its JSDoc is a bug. Only read files under ${target}; do not open anything outside it.`
const LENSES = [
  { key: 'logic', focus: 'logic errors: wrong arithmetic, off-by-one errors, wrong conditions, results that differ from the JSDoc' },
  { key: 'state', focus: 'state and async errors: inputs changed when they should not be, missing awaits, errors that escape their handling' },
  { key: 'input', focus: 'untrusted input: missing validation or containment that the JSDoc promises' },
]

phase('Find')
const verified = await pipeline(
  LENSES,
  lens => agent(
    `${SCOPE}\n\nReview the whole library with this focus: ${lens.focus}. Report every bug you find, with its file, the line number of the faulty code, and one sentence on what is wrong. Report nothing you are unsure of.`,
    { ...REVIEWER, label: `find:${lens.key}`, phase: 'Find', schema: FINDINGS },
  ),
  (found, lens) => agent(
    `${SCOPE}\n\nAnother reviewer reported the bugs below. Check each one against the code. Keep a finding only if the code really does differ from its JSDoc or is clearly wrong, and correct its line number if needed. Drop the rest.\n\n${JSON.stringify((found && found.findings) || [], null, 1)}`,
    { ...REVIEWER, label: `verify:${lens.key}`, phase: 'Verify', schema: FINDINGS },
  ),
)

// Barrier: the judge needs every confirmed list at once to merge duplicates.
phase('Report')
const confirmed = verified.filter(Boolean).flatMap(v => v.findings || [])
log(`${confirmed.length} confirmed findings before merging`)
const report = await agent(
  `${SCOPE}\n\nMerge these confirmed bug reports into one list. Two reports of the same bug become one, with the most precise file and line. Read the code only if you need to settle a disagreement.\n\n${JSON.stringify(confirmed, null, 1)}`,
  { ...JUDGE, label: 'report', phase: 'Report', schema: FINDINGS },
)
return { variant, findings: (report && report.findings) || [] }
