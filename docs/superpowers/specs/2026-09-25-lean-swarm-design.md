# Lean-Swarm: design spec

- **Date:** 2026-09-25
- **Status:** draft for Itay's review
- **Name:** "Lean-Swarm" is a working name. Choose the public name before the repo goes public.

## 1. Problem

When Claude Code runs several agents at once (the Workflow tool, or parallel subagents), the runs are slow and expensive: 15–100+ minutes and hundreds of millions of tokens. Almost none of that is the agents' own work. They mostly re-read the same context turn after turn. The goal is to cut tokens and wall-clock time for **every type** of multi-agent run (coding, research, review, audit) **without lowering quality**, and to prove quality held with measurements.

## 2. Baseline (measured 2026-09-25 on Itay's own logs)

Source: 203 finished workflow runs, 2,121 agents, 52,153 model turns, read from `~/.claude/projects/*/*/subagents/workflows/*/agent-*.jsonl` plus `.meta.json`. The scripts are in `research/baseline-2026-09-25/`.

| Measure | Value |
|---|---|
| Tokens read vs written | 8.08B read, 6.8M written (0.084%) |
| Re-reading cached context, share of price-weighted cost | 57% (median run) |
| Fixed context at the start of each turn, share of all tokens read | 43% (median run 55%) |
| Median first-turn context, default workflow agent (2,025 agents) | 68k tokens |
| Same, `code-reviewer` type with 4 tools | 29k tokens |
| Same, reviewer types without instruction files | 10–13k tokens |
| First-turn composition (374 agents with a prompt snapshot) | tools ~36k (41 tools; Artifact alone ~16k), instruction files ~12k, skill listing ~11k, deferred-tool listing ~6k, **task ~2k** |
| Share of agents that ever called a tool | Bash 82%, StructuredOutput 79%, Read 62%, Grep 26%, Write 19%, ToolSearch 18%, Edit 14%, WebFetch 13%, WebSearch 13%, PowerShell 9%, any browser tool 3%, Skill 0.2%, Artifact 0% |
| Where agent time went | model 75%, Bash 19%, web tools ~2.4% |
| Turns with exactly one tool call | 73%; about 16 s per turn |
| Same file or URL read by 2+ agents in one run | median 13%; 56 of 203 runs ≥30% |
| Runs where ≥95% of turns ran on Opus | 171 of 203 |

In one research run (8 agents), the verifier agents re-opened 164 of their 250 URLs (66%) that the research agents had already read.

## 3. Existing tools and the gap

We surveyed about 30 repos (details in `research/landscape.md`, to be written in M1).

**What exists:**
- **Compressing tool output inside one session:** Context Mode, RTK, headroom, tamp, pxpipe, sqz, omni.
- **Reading code in small pieces:** Serena, claude-context, jcodemunch.
- **Routing to other models:** claude-code-router.
- **Totals and audits:** ccusage, token-optimizer.

**Not covered by any of them:**
1. Trimming each subagent's fixed start of context by its role.
2. Sharing reads across agents in one run with measured results. A few tools claim it; none measures it.
3. Making fewer turns the main goal.
4. An end-to-end quality check on multi-agent runs. The best existing one is pxpipe, with 10 + 19 SWE-bench tasks.

**Lessons to carry over:**
- Verify that your tools are actually called. token-savior withdrew its benchmark after finding they were not.
- Count billed tokens, not bytes ÷ 4 (RTK's method).
- Never hand an agent a reference to content it never saw (the dedup risk in sqz and omni).
- Compressing history blindly, without regard to the task, loses 6–17 points (ACON, SWE-Pruner baselines).

## 4. Evidence: what is safe to cut

| Safe to cut | Carries quality: keep |
|---|---|
| Old tool results the agent already used (context editing: −84% tokens, better results) | How widely agents search (token use explains 80% of BrowseComp variance, per Anthropic) |
| Parts of an observation the task doesn't need, when trimming is task-guided (SWE-Pruner −23–38% on 500 tasks with no loss; FocusAgent −50%) | Verification (dropping ArcticSwarm's review gates cost 6–8 points) |
| Exact duplicates (shared cache, identical-prefix reuse) | Agents working independently before sharing (early sharing cost 3.8 points) |
| Tool definitions not needed right now (tool search: −85% tokens, higher accuracy) | Information needed later (cutting it causes 3× more re-fetching) |
| Turns made one call at a time (parallel calls: up to 3.7× faster) | A strong model on hard steps; handing off to a stronger model mid-task recovers less than half the quality gap |

**Principle: cut repetition, not thinking.**

## 5. Goals, non-goals, success criteria

**Goals**
- Fewer tokens and less wall-clock time for multi-agent Claude Code runs of all types.
- Quality no worse than the plain version, as defined in §8.
- Shareable as a Claude Code plugin, backed by public, reproducible measurements.

**Non-goals (v1)**
- Optimizing single-session chat; existing tools cover that.
- An API proxy. It breaks when Claude Code changes its request format, can invalidate the saved-context discount, and subscription-login proxies are a grey area in the terms. It stays an idea for later.
- Rebuilding what RTK or Context Mode already do well. We work alongside them.

**Success for v1 (targets, to be confirmed after M2's noise measurement)**
- On the quality-gate suite: at least **30% fewer tokens read** and at least **20% less wall-clock** per run.
- Every task type passes the §8 quality test.

## 6. Design principles

1. **Cut repetition, not thinking.** Keep exploration breadth, verification and independent work.
2. **Every lossy cut is reversible.** The raw data stays on disk and the agent can expand it.
3. **Every cut is opt-in, isolated and measured.** It becomes a default only after passing the gate.
4. **Measure billed tokens** from the usage fields, never bytes.
5. **Check our tools actually get called.** X-ray counts every call to them.
6. **Reuse proven tools where they fit.** Never bundle code whose license doesn't allow it (Context Mode is ELv2).
7. **Every decision gets a short "why" note** in `docs/decisions/`, so Itay can explain each choice.

## 7. Architecture

A Claude Code plugin plus a Node.js CLI. Node because the Claude Code ecosystem is JavaScript and there is no Python on this machine.

```
 Measure   xray CLI ── reads run logs ──► run report (tokens by kind, time split, turns,
                                           duplicate reads, fixed-context makeup, our tool usage)
 Cut       lean roles (plugin agents)      fan-out kit (plugin workflows)
           trim hook (PostToolUse)         run memory + batch tools (MCP server)
           step models (role config)       doctor (suggestions only)
 Prove     quality gate: task suite ─► A/B runner ─► judge ─► report (uses xray)
```

### 7.1 X-ray: `lean-swarm xray [run|all]`

- **Purpose:** show where each run's tokens and minutes went.
- **Input:** agent transcripts, `.meta.json` and `journal.jsonl` under `~/.claude/projects`.
- **Output (JSON + Markdown), per run and in aggregate:**
  - tokens by kind (uncached, cache read, cache write, output) and price-weighted shares;
  - fixed-context share, and its makeup from `prompt_snapshot` and attachments;
  - time split between the model and each tool;
  - turns, and calls per turn;
  - duplicate reads across agents;
  - model mix;
  - calls to Lean-Swarm tools, including `expand` re-fetches.
- **Nature:** read-only, so lossless. The quality gate also uses it.
- **Risk:** the log format is internal. The parser lives in one module, with fixture tests and a version check.

### 7.2 Lean roles (plugin agents)

| Role | Tools | Instruction files | Use |
|---|---|---|---|
| reader | Read, Grep, Glob, run-memory read tools | omit | map, understand |
| researcher | WebSearch, WebFetch, Read, Grep, Glob, Bash, run-memory tools | omit | web and paper research |
| coder | Read, Grep, Glob, Edit, Write, Bash | keep | build, fix |
| reviewer | Read, Grep, Glob, Bash, run-memory read tools | keep | review, audit |
| judge | Read, run-memory read tools | omit | verdicts, synthesis |

- **What a role leaves out:** Skill, ToolSearch, Artifact, PowerShell, browser tools and connector tools. On CLI 2.1.250 this also drops the skill listing and the deferred-tool listing (confirmed from the `code-reviewer` transcripts: 44 → 4 tools, 68k → 29k first turn).
- **Dropping instruction files:** uses `omitClaudeMd: true`, which needs CLI ≥ 2.1.271. Doctor flags the upgrade. Omitting instruction files is **lossy**, so each role must pass the gate before it's on by default.
- **Plugin-agent limits:** plugin agents ignore `hooks`, `mcpServers` and `permissionMode` in their frontmatter. MCP tools therefore come from the plugin-level server and are named in `tools`.
- **Model and effort:** inherited by default. Step models (§7.7) sets overrides.

### 7.3 Fan-out kit (plugin workflows)

- **Templates:**
  - research: sweep → verify → synthesize
  - review: find → verify
  - coding: build → review → fix
- **Shared saved context:** sibling calls keep agent type, model, effort and schema identical, with the variable text last, so they reuse one cached prefix (documented Claude Code behavior, with a sibling stagger). Uses `pipeline()` rather than barriers.
- **Handoff between stages:** passes compact findings from the run-memory board forward instead of raw transcripts.
- **Protects quality:** keeps search breadth and verification stages, and keeps siblings independent within a stage.

### 7.4 Trim hook (PostToolUse `updatedToolOutput`)

- **Scope:** only Lean-Swarm subagents (the scoping mechanism is question Q2), and only outputs above a size threshold (starting value 8,000 characters).
- **Rule-based trimmers first:**
  - build and test logs: keep errors, failures and the tail;
  - search results: cap them;
  - large files: outline plus the requested ranges;
  - web pages: main text only.
- **Raw output** is saved to the run directory. The trimmed output ends with a handle and "call `expand(handle, range)` for the rest".
- **Model-based, task-guided extraction** is a later option and must pass the gate. It adds latency (per FocusAgent).
- **Works alongside RTK:** skips commands RTK already rewrote.
- **Cache:** trimming happens before the content first reaches the model, so it doesn't invalidate saved context.
- **Nature:** lossy but reversible, gate-tested. X-ray counts `expand` calls.

### 7.5 Run memory and batch tools (MCP server)

**Tools:**
- `fetch(source, focus?)`: fetches a URL or file once per run and stores the full text on disk (PDF to text when `pdftotext` exists). Returns the passages relevant to `focus`, with line anchors and a handle.
- `expand(handle, range)`: returns the exact stored text.
- `read_many(paths[])`, `fetch_many(sources[])`: batch reads (see also §7.6).
- `post_finding({claim, quote, source, anchor})`, `read_findings(stage?)`: the findings board.
- `check_quote(source, quote)`: a rule-based fuzzy match that normalizes whitespace, ligatures and hyphenation. Returns found/not found and the location.

**Rules:**
- Sources are shared immediately.
- Findings are visible to later stages only, not to siblings in the same stage, to protect independence.
- Never return a reference to content the calling agent hasn't seen.

**Scope:** one directory per run (run id: Q1).

**Nature:** the cache and `check_quote` are lossless. Choosing which passages to return is lossy and gate-tested.

### 7.6 Fewer turns

- The batch tools from §7.5.
- A line in each role's prompt: make independent calls in the same turn.
- X-ray tracks calls per turn and turns per agent.

### 7.7 Step models

- **Role config:** maps each kind of step to a model and effort, for example:
  - extract, format, quote-judge → a faster model;
  - judgment and synthesis → Opus.
- **Default:** inherit, i.e. off. Each mapping must pass the gate.
- **Hand work down to a cheaper model, never up mid-task** (the handoff-tax evidence).

### 7.8 Doctor: `lean-swarm doctor`

- **Read-only.** It never writes anything; it prints the exact change for Itay to apply.
- **Checks user-level settings:**
  - CLI version (≥ 2.1.271 for `omitClaudeMd`);
  - `skillListingBudgetFraction` and `skillOverrides`;
  - `claudeMdExcludes`;
  - `subagentPromptCacheTtl`;
  - large MEMORY and rules files loaded into every agent;
  - how many MCP servers are loaded.

## 8. Quality gate

### 8.1 Suite (v1: 12 tasks, 4 per type)

- **Coding:** fixture repos with failing tests. Score = tests passing. Seeded from real past tasks where possible.
- **Research:** questions from past runs (model-extraction, trading "what are we missing", Blink research).
  - The gold list is the pooled, verified findings of at least 2 plain-version runs, deduplicated by a judge.
  - Score = gold-list recall plus claim correctness (a sampled audit with `check_quote` and a judge).
- **Review:** fixture code with planted bugs. Score = planted-bug recall minus a false-positive penalty.
- **Fairness:** inputs are frozen. Web tasks run both versions on the same day, because the web changes.

### 8.2 Protocol

- **Two versions:** the plain version (default agents, plain workflow) and the new version with exactly **one** change on. The full bundle is tested at the end.
- **Repeats:** paired per task, K = 3 runs per version. K goes up if the variation is too large.
- **Natural variation:** plain version vs plain version on the same tasks.
- **Pass rule (non-inferiority):** for each task type, the lower bound of the 90% bootstrap confidence interval of (new − plain) score must be ≥ −δ. The interval resamples by task. δ = the natural variation, written into the report before the runs.
- **Research syntheses:** a blind A vs B judge. Version labels are hidden, each pair is judged in both orders, and only order-consistent verdicts count.
- **Cost reported next to quality:** billed tokens by kind, price-weighted cost, wall-clock, turns, `expand` and re-fetch calls, and calls to our tools.

### 8.3 Cost of the gate itself

- The suite stays small.
- The budget for each round is stated before it runs.
- X-ray measures the gate's own runs.

## 9. Error handling and safety

- **Failures fall back to default behavior:**
  - the hook returns the original output if it errors;
  - MCP errors are explicit, and the agent can still use its built-in tools.
- **No automatic setting changes:** nothing writes user settings; Doctor only suggests.
- **Stored data:** run data stays local under `~/.lean-swarm/runs/<run-id>/` and is never committed.
- **No extra network use:** only the agents' own fetches.
- **Web content** is treated as data, never as instructions.

## 10. Testing

- **Unit tests** (`node:test`): log parser, trimmers, `check_quote`, cache. Fixtures come from real transcripts with personal content removed.
- **Integration:** the plugin loads, and a lean role really drops tools. Checked from the resulting transcript's `prompt_snapshot`: tool count, and no `skill_listing` attachment.
- **End to end:** the quality gate.
- **Coverage:** 80% target on library code.

## 11. Build order

Each milestone follows the same loop: measure → cut → prove → put the numbers in the README → commit.

| Milestone | Delivers |
|---|---|
| M1 | X-ray, plus a baseline report over all runs (the README's "before" numbers) |
| M2 | Quality gate: suite, runner, natural-variation measurement |
| M3 | Lean roles, fan-out kit and Doctor, through the gate. First before/after, then the LinkedIn post |
| M4 | Trim hook, through the gate |
| M5 | Run memory and batch tools, through the gate |
| M6 | Step models, through the gate |

## 12. Deliverables

- **Public GitHub repo** with a capitalised name, installable as a plugin via marketplace.
- **README** with measured before/after numbers and the method behind them.
- **LinkedIn post** after M3, based on the real numbers (Hebrew, Proof of Work look).

## 13. Risks

- **Claude Code changes:** its log format and behavior change between versions. Local CLI is 2.1.250; the changelog is at 2.1.282.
- **Behavior differs by version:** `omitClaudeMd` needs 2.1.271, and MEMORY.md is injected into subagents despite the docs (issues #87613, #92750).
- **The gate costs real usage.** Mitigated by a small suite and a stated budget per round.
- **Tokens ≠ money on a subscription.** Report both tokens and price-weighted units.
- **Overfitting to Itay's workflows.** Add a public benchmark subset after v1.

## 14. Open questions (to settle in the implementation plan)

- **Q1** How does an agent learn its run id: a workflow argument in the prompt, an environment variable, or the working directory?
- **Q2** Does the PostToolUse hook input say which subagent it came from (agent id/type), so trimming applies only inside Lean-Swarm runs?
- **Q3** What is the exact name of a plugin MCP tool for `tools` allowlists (`mcp__plugin_<plugin>_<server>__<tool>`)?
- **Q4** Is StructuredOutput still available when a role has a tools allowlist and the workflow passes a schema? The docs say yes; confirm.
- **Q5** Does `omitClaudeMd` also drop `~/.claude/rules/*.md` and MEMORY.md?
- **Q6** Does CLI 2.1.250 ignore unknown frontmatter fields such as `omitClaudeMd`, or reject the agent?
- **Q7** Final public name.
