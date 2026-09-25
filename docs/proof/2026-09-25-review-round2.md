# Proof round 2: a harder target, three runs each way (2026-09-25)

**Short version:** on a harder review task, the lean roles read **77% fewer tokens** per run and found **all 11 planted bugs in every run**, the same as default agents, with no false alarms. They cost about 36% less at API prices and ran about **12% slower**. The slowdown matches round 1, and it comes from the lean agents thinking more, not from the smaller toolset.

Raw output: [`2026-09-25-round2-raw.md`](2026-09-25-round2-raw.md). Round 1: [`2026-09-25-review.md`](2026-09-25-review.md).

## What changed from round 1

- **A harder target:** `proof/target-2`, 10 files, **11 subtler planted bugs** and **15 decoys** (correct code that looks suspicious, such as a documented in-place sort or a deliberate `== null`). `test/proof2.test.js` runs the library to prove each bug breaks its JSDoc and each decoy doesn't.
- **Audited first:** three auditors with different lenses looked for bugs that weren't planted, and two skeptics tried to refute each report. Two issues survived and were fixed before any run: a second cause behind the `hitCount` bug, and a `daysBetween` decoy that was wrong for years 0–99. Four arguable contracts were tightened.
- **Three runs each way instead of two,** so the noise between identical runs is measured three times.
- **The scorer counts decoy hits** (findings that flag correct code), and X-ray now counts files read through shell commands.

## Setup

- Claude Code 2.1.282 on the web. Model `claude-opus-5-5`, effort `xhigh` for every agent in both variants (checked in the transcripts).
- The lean roles are the project copies in `.claude/agents/`, loaded when this session started.
- The same 7-agent workflow as round 1: three reviewers → three checkers → one judge, with identical prompts in both variants.
- Runs alternated plain, lean, plain, lean, plain, lean, one at a time in one session.

## Quality

| Variant | Runs | Planted bugs found | Other findings | Decoy hits | Touched answer key |
|---|---:|---|---:|---:|---|
| plain | 3 | 11/11, 11/11, 11/11 | 0 | 0 | no |
| lean | 3 | 11/11, 11/11, 11/11 | 0 | 0 | no |

Every run found every bug and flagged nothing else. So on this task the lean roles lost nothing. But the model found everything both ways, so this shows "no loss here". It doesn't rule out a small loss on harder work.

## Tokens, cost and time

`xray --compare <3 plain runs> --vs <3 lean runs>`:

| Measure | Plain | Lean | Change | Noise (plain vs plain) |
|---|---:|---:|---:|---|
| Tokens read per run | 849.7k | 197.5k | **−77%** | 0% to −6% |
| Median first-turn context | 44.6k | 6.7k | **−85%** | 0% |
| API-price equivalent per run | $0.97 | $0.62 | **−36%** | 0% to −25% |
| Tokens written per run (thinking included) | 10.2k | 12.1k | **+18%** | 0% to +16% |
| Turns per run | 17.3 | 18 | +4% | 0% to −6% |
| Wall-clock per run | 86.0 s | 96.2 s | **+12%** | +2% to −11% |

- **Tokens read** is a solid result: a 77% cut against 0–6% noise.
- **Cost** falls less than tokens. Here most of the cost is cache writes and output, not the cheap cache reads the lean roles remove, and lean agents wrote more. The −36% is outside the ±25% noise, but only just.
- **Wall-clock:** plain runs took 91.8, 82.2 and 83.9 s; lean runs 96.8, 91.4 and 100.5 s. Lean was slower in 8 of the 9 plain-vs-lean pairs, and round 1 showed the same (+16%). The slowdown is small but looks real.

## Why lean was slower

Summed over the three runs of each variant (`proof/timing.js`, per stage):

| Stage | Variant | Turns | Output tokens | Thinking tokens | Model seconds per turn |
|---|---|---:|---:|---:|---|
| find | plain | 31 | 14,830 | 5,218 | 8.1, 7.4, 7.5 |
| find | lean | 30 | 17,878 | 6,512 | 8.4, 8.2, 8.3 |
| verify | plain | 18 | 12,196 | 2,484 | 6.2, 6.3, 6.2 |
| verify | lean | 21 | 14,782 | 4,540 | 8.1, 7.9, 7.0 |
| report | plain | 3 | 3,685 | 226 | 9.0, 9.8, 8.5 |
| report | lean | 3 | 3,664 | 110 | 9.3, 9.4, 9.3 |

- **The lean agents thought more:** about 25% more in the find stage and 80% more in the verify stage. The verify stage also took 21 turns against 18. More output is more generation time, and this is where the extra ~10 s per run goes.
- **It isn't the reasoning effort:** both variants ran at `xhigh`.
- **It isn't the tools:** turns in the find stage are the same (30 vs 31), and no agent ever tried a tool it didn't have.
- **Likely cause:** the role's own prompt. A default workflow agent starts with "Use the tools available to complete the task"; a lean reviewer starts with "Your job is to examine the material you are pointed at and report what you find". The second may invite a more thorough re-check in the verify stage. This is a hypothesis, not a result.
- **Next test:** a role body that mirrors the default workflow agent's wording, run against the current one. It needs a new session, because agent definitions load only at session start.

## X-ray's prediction

Run on the three plain runs alone, before looking at the lean ones, X-ray said lean roles would save **7.5k–42.8k tokens per turn** and **390.8k–2.2M tokens read** in total. Measured: **37.9k per turn** (44.6k → 6.7k) and **1.96M tokens read** (2.55M → 0.59M). Both fall inside the range, near the high end, as in round 1.

## What this means for real workflows

These agents are short (about 2–3 turns each), so the fixed start is 90% of what a default agent reads, and cutting it cuts almost everything. Longer agents keep adding their own conversation, so the fixed start is a smaller share. Across Itay's 2,121 real agents it was 43%. A start that shrinks by 57–85% then saves roughly **25–37% of tokens read**, not 77%. X-ray estimates this for any set of logs: it's the "Lean roles would save" line.

## Limits

- One task type (code review), one small codebase, three runs per variant. Not a statistical proof.
- Quality hit the ceiling in both variants, so a small difference can't be ruled out.
- One setup: Claude Code on the web with many connectors (225 deferred tools) and 29 skills, Opus 5.5 at `xhigh`. A lighter setup saves less.
- The roles were the project copies, not the installed plugin (a test keeps them identical).
