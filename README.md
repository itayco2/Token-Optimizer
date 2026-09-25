# Lean-Swarm

**See where your Claude Code multi-agent runs spend tokens and time, and cut the biggest cause.**

> "Lean-Swarm" is a working name.

When Claude Code runs several agents at once (workflows or parallel subagents), almost none of the tokens are the agents' own work. Measured across 203 workflow runs and 2,121 agents on one heavy setup:

- **8.08 billion tokens read, 6.8 million written.** Agents mostly re-read context.
- **43% of all tokens read is each agent's fixed start:** tool definitions, instruction files and listings, loaded before the task and re-read on every turn.
- **A default agent's first turn was 68k tokens. The task in it was about 2k.**
- **Agents never called most of what they loaded:** Artifact 0% of agents, Skill 0.2%, browser tools 3%.

This repo has two parts:

1. **X-ray,** a command that shows the same numbers for your own runs.
2. **Lean roles,** five agent types that load only the tools they use.

## X-ray

Needs Node 22 or later. It only reads your local logs; it changes nothing and sends nothing anywhere.

```
npx github:itayco2/Token-Optimizer xray
```

Or from a clone: `node bin/lean-swarm.js xray`.

| Command | What it does |
|---|---|
| `xray` | every run under `~/.claude/projects` |
| `xray <run-dir> ...` | only these runs |
| `xray --since 2026-09-01` | only runs since a date |
| `xray --compare <dirs> --vs <dirs>` | before vs after, side by side |
| `--json`, `--top N`, `--out FILE` | output options |
| `--show-paths` | include project names and paths. Off by default, so a report is safe to share |

The report covers tokens by kind, the fixed start and what fills it, which tools agents actually call, where the time goes, duplicate reads across agents, models, and **what lean roles would save on your runs**. Every number is defined in [docs/method.md](docs/method.md).

Excerpt from a real 4-agent run in a Claude Code on the web session:

```
- Fixed start of each turn: 93% of all tokens read.
- Same file or URL read by 2+ agents in one run: median 75% of reads.

| Agent type        | Agents | Fits role    | Median start | Saved per turn | Tokens read saved |
|-------------------|-------:|--------------|-------------:|---------------:|------------------:|
| statusline-setup  |      1 | judge (100%) |         8.7k |              0 |                 0 |
| Explore           |      1 | judge (100%) |        34.0k |    7.5k–28.2k  |      15.0k–56.5k  |
| workflow-subagent |      1 | judge (100%) |        45.1k |    7.5k–39.8k  |      15.0k–79.6k  |
```

Claude Code 2.1.282 no longer logs tool definitions, so on newer logs the saving is a range. On 2.1.250 logs it's exact.

## Lean roles

| Role | Tools | Use for |
|---|---|---|
| `reader` | Read, Grep, Glob | mapping and understanding |
| `researcher` | WebSearch, WebFetch, Read, Grep, Glob, Bash | web and paper research |
| `coder` | Read, Grep, Glob, Edit, Write, Bash | building and fixing |
| `reviewer` | Read, Grep, Glob, Bash | review and audit |
| `judge` | Read | verdicts and synthesis |

A tools allowlist also drops the skill listing and the deferred-tool listing, so the start shrinks much more than the tools alone. Measured first turns:

| Setup | Default agent | With an allowlist |
|---|---:|---:|
| Heavy local setup, CLI 2.1.250, with CLAUDE.md files | 68k | 29k (4 tools) |
| Claude Code on the web, CLI 2.1.282, 225 deferred tools | 45.1k | 8.7k (2 tools) |

**Install:**

```
/plugin marketplace add itayco2/Token-Optimizer
/plugin install lean-swarm@lean-swarm
```

Then start a new session: agent definitions load only when a session starts.

**Use:** in a workflow, `agent(prompt, { agentType: 'lean-swarm:reviewer' })`. In chat, ask Claude to use the `lean-swarm:reader` agent.

**Why it doesn't lower quality:** a role removes only tools the agent doesn't use, and structured output still works (checked). Every role keeps your instruction files. The honest caveat is agents that used PowerShell or a browser tool: they'll use Bash or WebFetch instead.

## Proof

[proof/](proof/) is a ready-to-run before/after. One review workflow with seven agents looks for six planted bugs, run twice with default agents and twice with lean roles. It's scored on bugs found, tokens and time. Results go in `docs/proof/`. **Not run yet.**

## Limits

- **Anthropic is fixing parts of this.** `omitClaudeMd` shipped in 2.1.271, and requests to trim subagent context are open. Lean roles may matter less over time. X-ray stays useful either way.
- **Savings depend on your setup.** Many skills, connectors and MCP servers mean bigger savings; a lean setup saves less. Run X-ray to see yours.
- **Single-session chat gains little.** Other tools cover that.

## More

- [Design spec](docs/superpowers/specs/2026-09-25-lean-swarm-design.md) and [build plan](docs/superpowers/plans/2026-09-25-lean-swarm-v1.md)
- [Decisions](docs/decisions/)
- [Baseline prototype scripts](research/baseline-2026-09-25/)

## Development

```
npm test
```

No dependencies. Tests use scrubbed real transcripts in `test/fixtures/` (made with `scripts/scrub-fixture.js`, which keeps structure and removes all text).

MIT license.
