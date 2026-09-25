Roles check: X-ray of the proof/roles-check.workflow.js run (rolePrefix "", project roles from .claude/agents/), 2026-09-25, Claude Code on the web.

# X-ray: 1 runs, 6 agents, 6 turns

2026-09-25 to 2026-09-25

## Summary

- **Tokens read:** 71.8k. **Written:** 1.8k (2.446% of read).
- **Fixed start of each turn:** 100% of all tokens read (median run 100%). This is what every agent loads before its task and re-reads on every turn.
- **Re-reading cached context:** 0% of price-weighted cost (median run).
- **Same file or URL read by 2+ agents in one run:** median 0% of reads; 0 of 1 runs at 30% or more.
- **API-price equivalent:** about $0.39 at list prices (2026-06-24). On a subscription this is a comparison unit, not a bill.
- **Lean roles would save:** about 14%–58% of tokens read (9.8k–41.7k). See "What you could cut".

## Tokens by kind

| Kind | Tokens | Share of tokens | Share of cost |
|---|---:|---:|---:|
| Cache read | 0 | 0.0% | 0.0% |
| Cache write | 71.8k | 97.6% | 91.1% |
| Uncached input | 12 | 0.0% | 0.0% |
| Output | 1.8k | 2.4% | 8.9% |

## Fixed start by agent type

| Agent type | Agents | Median first turn | Median turns | Fixed share of tokens read |
|---|---:|---:|---:|---:|
| judge | 1 | 2.9k | 1 | 100% |
| workflow-subagent | 1 | 47.1k | 1 | 100% |
| reviewer | 1 | 5.4k | 1 | 100% |
| reader | 1 | 4.4k | 1 | 100% |
| coder | 1 | 6.0k | 1 | 100% |
| researcher | 1 | 6.0k | 1 | 100% |

## What fills the first turn

Median tokens per agent. Where the log holds tool definitions (CLI 2.1.250 and nearby), the billed first-turn total is split by each part's share of characters. Where it doesn't (newer versions), logged parts are estimated from their length and the rest is shown as "not in the log".

| Part | judge | workflow-subagent | reviewer |
|---|---:|---:|---:|
| System prompt | 503 | 533 | 503 |
| Not in the log (mostly tool definitions) | 2.0k | 36.3k | 4.5k |
| Skill listing | 0 | 4.1k | 0 |
| Deferred-tool listing | 0 | 5.7k | 0 |
| Task | 158 | 158 | 158 |
| Other attachments | 275 | 275 | 275 |

## Tool use

Share of agents that called each tool at least once.

| Tool | Agents | Share |
|---|---:|---:|
| StructuredOutput | 6 | 100.0% |
| Any browser tool |  | 0.0% |

## Where the time went

| Spent on | Agent time | Share |
|---|---:|---:|
| Model | 0.3 min | 99.1% |
| other | 0.0 min | 0.8% |
| StructuredOutput | 0.0 min | 0.1% |

100% of turns made exactly one tool call; 1.00 calls per turn; about 3 s per turn; median 1 turns per agent.

## Models

| Model | Turns | Share |
|---|---:|---:|
| claude-opus-5-5 | 6 | 100.0% |

1 of 1 runs ran 95% or more of their turns on Opus.

## What you could cut

Each lean role loads only the tools it lists, which also drops the skill listing and the deferred-tool listing. The saving is re-read on every turn, so it counts once per turn. A range means the log does not hold the tool definitions. The high end leaves out 4.5k, what your agents that already have an allowlist still start with outside the log.

| Agent type | Agents | Fits role | Median start | Saved per turn | Tokens read saved |
|---|---:|---:|---:|---:|---:|
| judge | 1 | judge (100%) | 2.9k | 0 | 0 |
| workflow-subagent | 1 | judge (100%) | 47.1k | 9.8k–41.7k | 9.8k–41.7k |
| reviewer | 1 | judge (100%) | 5.4k | 0 | 0 |
| reader | 1 | judge (100%) | 4.4k | 0 | 0 |
| coder | 1 | judge (100%) | 6.0k | 0 | 0 |
| researcher | 1 | judge (100%) | 6.0k | 0 | 0 |

Roles: **judge** (Read), **reader** (Read, Grep, Glob), **reviewer** (Read, Grep, Glob, Bash), **researcher** (WebSearch, WebFetch, Read, Grep, Glob, Bash), **coder** (Read, Grep, Glob, Edit, Write, Bash). "none" means the agent called a tool no role has.

## Runs

| Run | Agents | Turns | Read | Fixed | Re-read cost | Dup reads | Minutes |
|---|---:|---:|---:|---:|---:|---:|---:|
| wf_ed68d315-cea | 6 | 6 | 71.8k | 100% | 0% | 0% | 0 |

---

Read with lean-swarm xray. Claude Code versions in these logs: 2.1.282. Lines skipped: none. Method: docs/method.md.
