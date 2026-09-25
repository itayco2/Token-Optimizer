# Lean-Swarm v1: build plan

> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans to carry this out task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X-ray (a CLI that explains where multi-agent runs spend tokens and time), five lean roles (a Claude Code plugin), and a before/after on one real workflow.

**Spec:** `docs/superpowers/specs/2026-09-25-lean-swarm-design.md`

**Tech stack:** Node 22, ES modules, `node:test`, no runtime dependencies.

**Where each task runs:** some tasks need Itay's real logs or his local Claude Code (CLI 2.1.250, Windows). Those are marked **[Itay's machine]**. The rest can run anywhere, including a cloud session, marked **[anywhere]**.

## File map

```
package.json                     bin: lean-swarm → bin/lean-swarm.js
bin/lean-swarm.js                argument parsing, subcommand dispatch
src/logs.js                      the only module that knows the log format
src/measure.js                   pure functions: log data in, numbers out
src/prices.js                    relative price weights per model, with source date
src/report.js                    Markdown and JSON output
scripts/scrub-fixture.js         dev tool: copies a run dir with content removed
test/fixtures/<run>/...          scrubbed real runs plus hand-made edge cases
test/*.test.js
.claude-plugin/plugin.json       plugin manifest
.claude-plugin/marketplace.json  so the repo installs as a marketplace
agents/{reader,researcher,coder,reviewer,judge}.md
research/baseline-2026-09-25/    the four prototype scripts (reference only)
docs/decisions/                  one "why" note per decision
docs/method.md                   how each number is computed
docs/proof/                      the before/after write-up
```

---

## Task 1: Answer the open questions (spike) [Itay's machine]

**Why first:** Q1 decides whether lean roles work in workflows at all. It takes about 30 minutes and can run while X-ray is built.

- [ ] **Q1 + Q2.** Create a throwaway agent `~/.claude/agents/lean-probe.md`:

  ```markdown
  ---
  name: lean-probe
  description: Throwaway probe for tool allowlists. Do not use.
  tools: Read, WebFetch
  ---
  You are a probe agent.
  ```

  Run a two-agent workflow where each agent uses this type and has a `schema`: one reads a file, one fetches a URL.
  - **Q1 pass:** both agents return structured output.
  - **Q2 pass:** the transcript shows WebFetch loaded directly, with no ToolSearch call and no deferred-tool listing.
- [ ] **Q3.** Load the repo as a plugin with `claude --plugin-dir <repo>` once Task 8 has one role, and find the name a workflow uses for it (`lean-swarm:reader` or plain `reader`). Check that the role's tools list holds inside the workflow.
- [ ] **Q4.** `ls ~/.claude/projects/*/*/subagents/` and compare a plain Agent-tool subagent's `.jsonl` with a workflow agent's: same line types, usage fields and meta file?
- [ ] Write the answers to `docs/decisions/0002-open-questions.md`, delete `lean-probe.md`, commit.

**If Q1 fails:** lean roles can't be used in workflows with schemas. Stop and rethink M2 before building it. X-ray is unaffected.

## Task 2: Repo skeleton [anywhere]

**Files:** `package.json`, `bin/lean-swarm.js`, `.gitignore`, `test/cli.test.js`

- [ ] `package.json`:

  ```json
  {
    "name": "lean-swarm",
    "version": "0.1.0",
    "description": "See where your Claude Code multi-agent runs spend tokens and time",
    "type": "module",
    "bin": { "lean-swarm": "bin/lean-swarm.js" },
    "engines": { "node": ">=22" },
    "scripts": { "test": "node --test --experimental-test-coverage" },
    "license": "MIT"
  }
  ```

- [ ] `bin/lean-swarm.js`: `#!/usr/bin/env node`, parse args with `node:util` `parseArgs`, dispatch `xray`, print help for `--help` or unknown commands, exit code 2 on bad usage.
- [ ] `.gitignore`: `node_modules/`, `coverage/`, `*.local.*`, and `out/` (reports on real logs never get committed by accident).
- [ ] Test: `lean-swarm --help` exits 0 and names `xray`; `lean-swarm nope` exits 2.
- [ ] `npm test` passes. Commit.

## Task 3: Prototype scripts and fixtures [Itay's machine, then anywhere]

**Files:** `research/baseline-2026-09-25/*.js`, `scripts/scrub-fixture.js`, `test/fixtures/`

- [ ] Add the four prototype scripts (`wfcost.js`, `wfall.js`, `prefix.js`, `timeuse.js`) unchanged. They are the reference for how each §2 number was computed.
- [ ] Write `scripts/scrub-fixture.js <run-dir> <out-dir>`:
  - copies every `.jsonl`, `.meta.json` and `journal.jsonl`;
  - keeps all keys, numbers, booleans, timestamps, `type` values, model names, tool names and `version`;
  - replaces other strings with `x` repeated to the same length, so the makeup split by characters still works;
  - replaces file paths and URLs with stable placeholders (`path-1`, `url-1`, the same input always giving the same placeholder), so duplicate reads still show;
  - splits lines on `/\r?\n/` (Windows).
- [ ] Test the scrubber on a hand-made line: structure and lengths kept, no original text left.
- [ ] **[Itay's machine]** Scrub two small real runs: one with a `schema` agent and a file read by two agents, and one with web fetches. Grep the output for his name, paths and a few words from the prompts; nothing should match. Copy both into `test/fixtures/`.
- [ ] Add hand-made edge cases: a truncated last line, an unknown line type, an agent with no usage, an agent killed mid-turn.
- [ ] Commit.

## Task 4: Log reader [anywhere]

**Files:** `src/logs.js`, `test/logs.test.js`

- [ ] Failing tests first, against the fixtures:
  - `findRuns(root)` finds every `subagents/workflows/*/` dir, plus plain subagents if Q4 said yes;
  - `readRun(dir)` returns `{ runId, meta, versions, agents, skipped }`;
  - each agent has `{ id, type, model, turns, firstTurn }`, where a turn is `{ start, end, usage, toolCalls: [{ name, target, start, end }] }` and `target` is the path or URL read, if any;
  - the truncated line, the unknown line type and the agent with no usage are counted in `skipped` with a reason, and never throw.
- [ ] Implement, taking field names from the prototype scripts. Nothing outside this module may touch raw log lines.
- [ ] Record each distinct CLI `version` seen, so reports can say which versions they read.
- [ ] Tests pass. Commit.

## Task 5: Measures [anywhere]

**Files:** `src/measure.js`, `src/prices.js`, `docs/method.md`, `test/measure.test.js`

- [ ] Failing tests first, with expected values worked out by hand on the fixtures:
  - `tokensByKind(agents)`: uncached, cache read, cache write (5-minute and 1-hour kept apart), output;
  - `priceWeighted(tokens, model)`: shares, using `src/prices.js`;
  - `fixedStart(agent)`: first-turn context, and the fixed-start share of tokens read. **Use the same definition as `wfall.js`**;
  - `startMakeup(agent)`: billed first-turn total split by each part's share of characters in the prompt snapshot (each tool by name, instruction files, MEMORY and rules files, skill listing, deferred-tool listing, task);
  - `toolUse(agents)`: per tool, the share of agents that loaded it and the share that called it;
  - `timeSplit(agents)`: model time vs each tool's time, same method as `timeuse.js`;
  - `turnStats(agents)`: turns per agent, calls per turn;
  - `duplicateReads(run)`: share of reads whose target another agent in the run already read;
  - `modelMix(agents)`.
- [ ] `src/prices.js`: relative weights per model, taken from Anthropic's published price list on the day it's written, with the date and link in a comment. Weights, not dollars.
- [ ] Implement as pure functions.
- [ ] Write `docs/method.md`: one short paragraph per number, saying exactly how it's computed.
- [ ] Tests pass, coverage ≥ 80% on `src/`. Commit.

## Task 6: Report and CLI [anywhere]

**Files:** `src/report.js`, `bin/lean-swarm.js`, `test/report.test.js`

- [ ] Failing tests first:
  - the Markdown for a fixture run matches a stored snapshot;
  - the JSON has the same numbers;
  - no scrubbed string, path or URL placeholder appears unless `--show-paths` is passed;
  - `--compare A --vs B` prints both groups side by side with the difference.
- [ ] Report sections, in order: summary line, tokens by kind, fixed start and its makeup, tool use (loaded vs called), time split, turns, duplicate reads, models, **What you could cut**, and footer (CLI versions read, lines skipped).
- [ ] **What you could cut:** per agent type, the tokens spent on tools it loaded and never called, and the lean role whose tool list covers what it did call.
- [ ] Wire up `xray <run-dir>`, `xray --all [--since DATE]`, `xray --compare`, `--json`, `--show-paths`. Default root: `path.join(os.homedir(), '.claude', 'projects')`.
- [ ] Tests pass. Commit.

## Task 7: Check X-ray against the baseline [Itay's machine]

- [ ] `node bin/lean-swarm.js xray --all --since 2026-01-01 > out/baseline.md` (use the same run set as §2).
- [ ] Compare with spec §2: token counts exact, shares within 1 point. For every mismatch, find which of X-ray or the prototype is wrong, fix it, and add a test that covers it.
- [ ] Time it on all 203 runs. If it takes over a minute, stream lines instead of reading whole files.
- [ ] Read the "What you could cut" section. Does it match what Itay knows about his setup?
- [ ] Copy the aggregate report (no `--show-paths`) to `docs/baseline/2026-09-25.md`. This is M1: the README's "before" numbers. Commit.

## Task 8: Lean roles [anywhere, then Itay's machine]

**Files:** `agents/*.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

- [ ] Check each role's tool list against Task 7's tool use per agent type. Change a list only with a reason, and note it in `docs/decisions/0003-role-tool-lists.md`.
- [ ] One file per role. Example, `agents/reader.md`:

  ```markdown
  ---
  name: reader
  description: Reads and maps code or documents without editing or going online. Use for exploring, mapping and understanding. Loads only Read, Grep and Glob, so it starts with much less context than a default agent.
  tools: Read, Grep, Glob
  model: inherit
  ---
  You are the reader in a multi-agent run. Your job is to read and understand the material you are pointed at and report what you find.
  ```

  Keep each body to one or two neutral sentences. No instructions that change how the agent works (spec §7.2).
- [ ] `.claude-plugin/plugin.json` with name, version, description and author. `.claude-plugin/marketplace.json` listing the one plugin, so `/plugin marketplace add itayco2/<repo>` works.
- [ ] **[Itay's machine] Integration check:** run a small workflow that uses each role once, with a `schema`. Then `xray` on that run. Pass:
  - each role's first turn ≤ 30k tokens;
  - loaded tools match the role's list;
  - no `skill_listing` attachment;
  - structured output returned.
- [ ] Commit. This is M2.

## Task 9: The proof run [Itay's machine]

- [ ] **Pick the workflow** (Itay): one he runs often, 6–12 agents, coding or review if possible. Freeze its inputs.
- [ ] Make a lean copy that differs only in agent types: each `agent()` call gets the role that fits.
- [ ] Estimate the usage of 4 runs from the workflow's past runs in X-ray. Write the budget down before running.
- [ ] Same day, same model and effort: plain, lean, plain, lean (alternating, so time of day affects both equally).
- [ ] `lean-swarm xray --compare <plain runs> --vs <lean runs>`.
- [ ] **Output check:** tests pass (coding), bugs found (review), or a blind read of both outputs (research).
- [ ] Check for errors from agents trying tools a role left out, especially PowerShell and browser tools.
- [ ] Write `docs/proof/2026-xx-xx-<workflow>.md`: numbers, noise floor (the plain vs plain gap), output check, and limits. Commit.

## Task 10: README and release [anywhere]

- [ ] Settle the public name (Q5), rename the repo and package, update the spec.
- [ ] README, in this order:
  - one sentence on what it does;
  - the one command: `npx github:itayco2/<repo> xray --all`;
  - a sample report (from a fixture, not real logs);
  - before/after from Task 9, with a link to the method;
  - installing the roles: `/plugin marketplace add itayco2/<repo>` then `/plugin install lean-swarm@<repo>`;
  - limits: one workflow, Itay's heavy setup, Anthropic fixing parts of this.
- [ ] `LICENSE` (MIT).
- [ ] Test the `npx` command on a machine or account that isn't Itay's.
- [ ] Make the repo public. This is M3. The LinkedIn post comes after.
