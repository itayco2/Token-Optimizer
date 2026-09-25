# Lean-Swarm: design spec (v1)

- **Date:** 2026-09-25
- **Status:** v1 scope, for Itay's review
- **Name:** "Lean-Swarm" is a working name. Choose the public name before the repo goes public (Q5).
- **Scope change:** the first draft had nine parts and a 12-task quality gate, which is weeks of work. v1 keeps the three parts that carry most of the value and take a few days. Everything else is in §9 "Later". The full first draft is in git history (commit `c669ccc`). Why: `docs/decisions/0001-cut-v1-scope.md`.

## 1. Problem

When Claude Code runs several agents at once (the Workflow tool, or parallel subagents), the runs are slow and expensive: 15–100+ minutes and hundreds of millions of tokens. Almost none of that is the agents' own work. They mostly re-read the same context turn after turn.

The biggest single cause is each agent's **fixed start**: tool definitions, instruction files and listings, loaded before the task and re-read on every turn. It is 43% of all tokens read. In a default workflow agent's 68k-token first turn, the task itself is about 2k.

**v1 goal:** show each user where their own multi-agent runs waste tokens, and cut the biggest cause with a change that can't lower quality.

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

We surveyed about 30 repos (details in `research/landscape.md`, to be written).

**What exists:**
- **Compressing tool output inside one session:** Context Mode, RTK, headroom, tamp, pxpipe, sqz, omni.
- **Reading code in small pieces:** Serena, claude-context, jcodemunch.
- **Routing to other models:** claude-code-router.
- **Totals and audits:** ccusage, token-optimizer.

**Not covered by any of them:**
1. **Explaining** where a multi-agent run's tokens and time went, by cause. ccusage shows totals only. *(v1: X-ray)*
2. Trimming each subagent's fixed start by its role. *(v1: lean roles)*
3. Sharing reads across agents in one run, with measured results. *(Later)*
4. Making fewer turns the main goal. *(Later)*
5. An end-to-end quality check on multi-agent runs. The best existing one is pxpipe, with 10 + 19 SWE-bench tasks. *(Later)*

**Lessons to carry over:**
- Verify that your tools are actually called. token-savior withdrew its benchmark after finding they were not.
- Count billed tokens, not bytes ÷ 4 (RTK's method).
- Never hand an agent a reference to content it never saw (the dedup risk in sqz and omni).
- Compressing history blindly, without regard to the task, loses 6–17 points (ACON, SWE-Pruner baselines).

**Demand signals:** token-saving tools are among the most-starred Claude Code repos (RTK 82k, headroom 74k, Context Mode 24k), and open Claude Code issues ask for this directly: anthropics/claude-code#74318 (the context every new subagent starts with) and anthropics/claude-code#93477 (leave out the skill listing).

## 4. v1 scope

| Part | What it is | Why it's in v1 | Effort |
|---|---|---|---|
| **X-ray** | One command that shows where a user's multi-agent runs spend tokens and time, by cause | Nobody else explains causes. The prototype scripts already do about 80% of it | about a day |
| **Lean roles** | 5 agent definitions that load only the tools each role uses | Targets the biggest cause (fixed start, 43% of tokens read). Already measured: 68k → 29k first turn | a few hours; mostly short config files |
| **Proof** | Run one real workflow of Itay's both ways and compare tokens, time and output | Gives the before/after for the README and the post | a few hours, plus the usage cost of the runs |

**Why this cut works:** the waste isn't spread evenly. One cause, the fixed start, is 43% of all tokens read. It is also the one cut that needs no quality gate: removing a tool an agent never calls can't change what it does. Every lossy cut moves to §9.

## 5. Goals, non-goals, success criteria

**Goals**
- Any Claude Code user can run one command and see where their own multi-agent runs spend tokens and time.
- Lean roles that cut an agent's fixed start without changing what it does.
- A measured before/after on one real workflow, with the method written down.

**Non-goals (v1)**
- **Anything lossy:** omitting instruction files, trimming tool output, sharing reads, model routing. All in §9.
- **A statistical quality proof.** v1 claims only what one workflow shows, and says so.
- Optimizing single-session chat; existing tools cover that.
- An API proxy. It breaks when Claude Code changes its request format, can invalidate the saved-context discount, and subscription-login proxies are a grey area in the terms.
- Rebuilding what RTK or Context Mode already do well. We work alongside them.

**Success criteria**
- **X-ray is correct:** on Itay's logs it reproduces the §2 numbers (token counts exact, shares within 1 point), and its fixture tests pass.
- **X-ray works for others:** it runs with one command and no config on a setup it has never seen. It skips and counts log lines it doesn't recognize instead of crashing or guessing.
- **Lean roles cut the start:** every role's first-turn context is ≤ 30k tokens on Itay's setup (default: 68k), measured by X-ray on the roles' own transcripts.
- **Lean roles don't break workflows:** an agent with a `schema` still returns structured output (Q1), and no role needs ToolSearch to reach its own tools (Q2).
- **Proof:** on one real workflow, **≥ 20% fewer tokens read** with lean roles, and output that holds up in the §7.3 check. Expected: 25–30%, since the fixed start is 43–55% of tokens read and the roles cut it by about 57%. Wall-clock is reported without a target: this cut is mainly about tokens.

## 6. Design principles

1. **Cut repetition, not thinking.** Keep exploration breadth, verification and independent work.
2. **v1 makes no lossy cuts.** A cut goes in v1 only if it can't change what an agent does.
3. **Measure billed tokens** from the usage fields, never bytes.
4. **Check what agents actually call** before removing it, and show that data to the user.
5. **Reuse proven tools where they fit.** Never bundle code whose license doesn't allow it (Context Mode is ELv2).
6. **Every decision gets a short "why" note** in `docs/decisions/`, so Itay can explain each choice.

## 7. Architecture

One repo with two things in it: a Node.js CLI (X-ray) and a Claude Code plugin (the lean roles). Node 22, because the Claude Code ecosystem is JavaScript and Itay's machine has no Python. No runtime dependencies, so `npx` is fast and there is no supply chain to audit.

```
 Measure   xray CLI ── reads run logs ──► run report (tokens by kind, fixed-start makeup,
                                           tool use, time split, turns, duplicate reads, models)
 Cut       lean roles (plugin agents)
 Prove     one workflow, plain vs lean, 2 runs each ──► comparison report (uses xray)
```

### 7.1 X-ray: `lean-swarm xray`

- **Commands:** `xray <run-dir>`, `xray --all [--since DATE]`, `xray --compare <runs A> --vs <runs B>`. Markdown by default, `--json` for machines.
- **Input:** agent transcripts, `.meta.json` and `journal.jsonl` under `~/.claude/projects`. Plain Agent-tool subagents too, if their logs share the format (Q4).
- **Output, per run and in aggregate:**
  - tokens by kind (uncached, cache read, cache write, output) and price-weighted shares;
  - fixed-start share, and its makeup: each tool definition by name, instruction files, MEMORY and rules files, skill listing, deferred-tool listing, task;
  - **tool use:** for each tool, the share of agents that loaded it and the share that called it;
  - time split between the model and each tool;
  - turns, and calls per turn;
  - duplicate reads across agents in one run;
  - model mix.
- **"What you could cut":** the last section lists, per agent type, the tokens spent on tools it loads and never calls, and the lean role that fits. The report shows each reader their own numbers instead of promising Itay's.
- **Makeup method:** the first turn's billed total comes from its usage fields. It is split between parts by each part's share of characters in the prompt snapshot. The report says so.
- **Price weights:** relative weights per model, from Anthropic's published prices, in one table with its source date. Reported as price-weighted units, not dollars, because on a subscription tokens aren't money.
- **Privacy:** the report never prints prompt or output text. File paths and URLs appear only with `--show-paths`, so a report is safe to paste in public by default.
- **Nature:** read-only.
- **Risk:** the log format is internal. The parser lives in one module, with fixture tests. Each report records the CLI versions it read, and counts lines it couldn't parse.

### 7.2 Lean roles (plugin agents)

| Role | Tools | Use |
|---|---|---|
| reader | Read, Grep, Glob | map, understand |
| researcher | WebSearch, WebFetch, Read, Grep, Glob, Bash | web and paper research |
| coder | Read, Grep, Glob, Edit, Write, Bash | build, fix |
| reviewer | Read, Grep, Glob, Bash | review, audit |
| judge | Read | verdicts, synthesis |

- **What a role leaves out:** Skill, ToolSearch, Artifact, PowerShell, browser tools and connector tools. On CLI 2.1.250 a tools allowlist also drops the skill listing and the deferred-tool listing (confirmed from the `code-reviewer` transcripts: 44 → 4 tools, 68k → 29k first turn).
- **Why it's safe:** from §2, agents called Artifact 0% of the time and Skill 0.2%. ToolSearch (18%) only loads deferred tools, and the roles name their tools directly. Two cuts do change behavior slightly: agents that used PowerShell (9%) or a browser tool (3%) will use Bash or WebFetch instead. The proof run checks this.
- **Tool lists are final only after X-ray:** each list is checked against X-ray's tool use per agent type on Itay's logs before release.
- **Instruction files are kept in every role.** Omitting them (`omitClaudeMd`, CLI ≥ 2.1.271) is lossy, so it's in §9.
- **Role prompt:** short and neutral. It names the role and adds no instructions that change how the agent works. A "make independent calls in the same turn" line would cut turns, but it's a behavior change, so it's in §9.
- **Model and effort:** inherited.
- **Opt-in:** a role is used only when a workflow or the user names it (Q3). Nothing changes default agents.

### 7.3 Proof: one workflow, both ways

- **Pick:** one real workflow Itay runs often, with 6–12 agents and frozen inputs. Prefer coding or review, because tests or planted bugs can score the output. A research workflow needs a blind read.
- **Runs:** plain twice, lean twice, on the same day with the same model and effort. The gap between the two plain runs is the noise floor. State the usage budget before running.
- **Compare with `xray --compare`:** tokens read by kind, price-weighted units, wall-clock, turns, first-turn context per agent, and errors from agents trying tools a role left out.
- **Output check:** coding: tests pass. Review: bugs found. Research: Itay reads both outputs with the labels hidden.
- **Write-up:** `docs/proof/<date>-<workflow>.md` with the numbers, the method and the limits. The claim is "on this workflow, with this setup", and the README says so.

## 8. Safety and testing

- **Nothing writes user settings.** X-ray only reads. Roles are opt-in.
- **No network use.** X-ray reads local files only.
- **Unit tests** (`node:test`): log parser, measures, report. Fixtures come from real transcripts with the content removed by `scripts/scrub-fixture.js`. It keeps keys, numbers, tool names and string lengths, and replaces paths with stable placeholders so duplicate reads still show.
- **Integration:** a lean role really drops tools. X-ray on the role's transcript shows the listed tool count and no `skill_listing` attachment.
- **Coverage:** 80% target on `src/`.

## 9. Later (v2, if people want it)

| Part | What it does | Why it waits |
|---|---|---|
| Omit instruction files | `omitClaudeMd: true` per role; reviewer types measured at 10–13k first turn | Lossy. Needs CLI ≥ 2.1.271 and the gate |
| Fan-out kit | Workflow templates (research, review, coding) whose sibling agents share one cached prefix and pass compact findings between stages | Changes how runs are structured; needs the gate |
| Trim hook | PostToolUse hook that trims large outputs (logs, search results, pages) and keeps the raw text behind an `expand` handle | Lossy. Scoping it to our agents is an open question |
| Run memory and batch tools | MCP server: fetch each source once per run, `expand`, findings board, `check_quote`, `read_many` | The biggest build. Choosing passages is lossy |
| Fewer turns | Batch tools plus a parallel-calls line in each role | Changes behavior; needs the gate |
| Step models | Faster models on extract and format steps, Opus on judgment | Lossy; needs the gate |
| Doctor | Read-only check of settings that add to every agent's start | Small, but X-ray's "what you could cut" covers the main case |
| Full quality gate | 12 tasks, 4 per type, K = 3 paired runs, 90% bootstrap non-inferiority, blind judge for syntheses | Needed only once lossy cuts arrive |

**Evidence for the later parts** (from the first draft's survey):

| Safe to cut | Carries quality: keep |
|---|---|
| Old tool results the agent already used (context editing: −84% tokens, better results) | How widely agents search (token use explains 80% of BrowseComp variance, per Anthropic) |
| Parts of an observation the task doesn't need, when trimming is task-guided (SWE-Pruner −23–38% on 500 tasks with no loss; FocusAgent −50%) | Verification (dropping ArcticSwarm's review gates cost 6–8 points) |
| Exact duplicates (shared cache, identical-prefix reuse) | Agents working independently before sharing (early sharing cost 3.8 points) |
| Tool definitions not needed right now (tool search: −85% tokens, higher accuracy) | Information needed later (cutting it causes 3× more re-fetching) |
| Turns made one call at a time (parallel calls: up to 3.7× faster) | A strong model on hard steps; handing off to a stronger model mid-task recovers less than half the quality gap |

**Open questions for the later parts:** how an agent learns its run id; whether PostToolUse hook input names the subagent; the exact name of a plugin MCP tool in `tools`; whether `omitClaudeMd` also drops `~/.claude/rules/*.md` and MEMORY.md; whether CLI 2.1.250 ignores unknown frontmatter fields.

## 10. Risks

- **Claude Code changes:** its log format and behavior change between versions. Local CLI is 2.1.250; the changelog is at 2.1.282.
- **Anthropic is fixing parts of this.** `omitClaudeMd` shipped in 2.1.271, and anthropics/claude-code#74318 and anthropics/claude-code#93477 are open. Lean roles may matter less within months. X-ray stays useful either way.
- **Itay's setup is heavy:** hundreds of skills, many connectors, Opus everywhere. Someone with a lean setup saves less. X-ray shows each person their own numbers for this reason.
- **MEMORY.md is injected into subagents despite the docs** (anthropics/claude-code#87613, anthropics/claude-code#92750). X-ray reports it as its own row in the makeup.
- **One workflow isn't a statistical proof.** The claim is scoped to that workflow, and the noise floor is shown next to it.
- **Tokens ≠ money on a subscription.** Report both tokens and price-weighted units.

## 11. Build order

Each milestone ends with its numbers in the README and a commit.

| Milestone | Delivers |
|---|---|
| M1 | X-ray, plus a baseline report over all of Itay's runs (the README's "before" numbers) |
| M2 | Lean roles as a plugin, checked by the integration test |
| M3 | The proof run, the README before/after, then the LinkedIn post |

## 12. Deliverables

- **Public GitHub repo** with a capitalised name, installable as a plugin via marketplace, and X-ray runnable with one `npx` command.
- **README** with measured before/after numbers and the method behind them.
- **LinkedIn post** after M3, based on the real numbers (Hebrew, Proof of Work look).
- **Resume line** with a hard number, for example "cut subagent starting context 57%, measured across 2,121 agents".

## 13. Open questions (v1)

- **Q1** Is StructuredOutput still available when a role has a tools allowlist and the workflow passes a schema? The docs say yes; confirm. 79% of agents use it, so this decides whether lean roles work in workflows at all.
- **Q2** When a role names WebFetch or WebSearch in `tools`, are they loaded directly, so the agent never needs ToolSearch?
- **Q3** How does a workflow script name a plugin agent (`lean-swarm:reader`?), and does the role's tools list apply inside workflows?
- **Q4** Do plain Agent-tool subagents write logs in the same format as workflow agents, so X-ray covers them?
- **Q5** Final public name. The repo is currently `Token-Optimizer`, which clashes with the existing `token-optimizer` tool from §3.
