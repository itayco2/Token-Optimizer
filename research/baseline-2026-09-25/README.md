# Baseline measurement, 2026-09-25

Quick prototype scripts behind the numbers in `docs/superpowers/specs/2026-09-25-lean-swarm-design.md` §2. They read Claude Code's local workflow transcripts (`~/.claude/projects/*/*/subagents/workflows/*/agent-*.jsonl` + `.meta.json`) and change nothing. Run with Node 22.

| Script | Measures |
|---|---|
| `wfcost.js <run-dir>` | per-agent tokens, turns, minutes, tool mix for one run |
| `wfall.js` | every run: tokens read/written, fixed-context share, re-read cost share, cross-agent duplicate reads, Opus share |
| `prefix.js` | what fills an agent's first turn: tool definitions, instruction files, skill listing, deferred-tool listing, task |
| `timeuse.js` | where agent wall-clock goes (model vs each tool), tool usage rates, calls per turn |

These are throwaway prototypes; M1 (X-ray) replaces them with a tested CLI.
