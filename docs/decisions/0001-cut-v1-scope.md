# 0001: Cut v1 to X-ray, lean roles and a one-workflow proof

- **Date:** 2026-09-25
- **Status:** accepted

## Decision

v1 ships three parts: X-ray, lean roles and a before/after on one real workflow. The other six parts of the first draft, and the full quality gate, move to "Later" (spec §9).

## Why

- **The waste isn't spread evenly.** The fixed start of each turn is 43% of all tokens read. Lean roles go straight at it.
- **That cut needs no quality gate.** Removing a tool an agent never calls can't change what it does. Every other cut in the draft is lossy, and each one needs the 12-task gate with repeated runs: weeks of work and real usage.
- **X-ray is most of the value for other people.** Their setups differ from Itay's, so a tool that shows their own numbers helps more than a promise of his.
- **Size.** The draft was weeks of work. This is a few days, which suits a portfolio project and a post.

## What we give up

- No statistical quality proof in v1. The claim is scoped to one workflow.
- The largest possible savings (trimming, shared reads, step models) wait for v2.
- Lean roles may matter less once Anthropic ships its own fixes (`omitClaudeMd` is already out). X-ray stays useful regardless.
