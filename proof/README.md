# Proof run: plain vs lean agents

This kit runs one real multi-agent workflow twice each way and compares tokens, time and output.

- **The task:** review `target/`, a small library with six planted bugs. Each bug is a place where the code breaks its own JSDoc. `grading/key.json` lists them.
- **The workflow:** `review.workflow.js`. Three reviewers (one lens each) → three checkers → one judge that merges the lists: 7 agents. The plain and lean variants use identical prompts. The only difference is the agent type: default agents, or `lean-swarm:reviewer` and `lean-swarm:judge`. `test/proof.test.js` checks this.
- **Scoring:** `score.js` counts the planted bugs in the judge's final list (same file, line within 3) and lists other findings. It also flags any run whose agents touched `grading/`.

## Why it needs a fresh session

Claude Code loads agent definitions only when a session starts. The lean roles must be installed before the session that runs the proof begins.

**In a Claude Code on the web session,** a repository's plugin marketplace is not loaded (that needs the workspace trust prompt, which cloud sessions never show). Project agents in `.claude/agents/` do load. This repo keeps exact copies of the roles there (a test keeps them in sync), so pass `"rolePrefix": ""` in the workflow args to use them as `reviewer` and `judge` instead of `lean-swarm:reviewer` and `lean-swarm:judge`.

## Steps

1. **Start a session with the plugin loaded,** in the repo root:
   - **Local:** `claude --plugin-dir .`
   - **Or install it:** `/plugin marketplace add itayco2/Token-Optimizer`, then `/plugin install lean-swarm@lean-swarm`, then start a new session.

2. **Check the roles** (about a minute). Ask Claude:

   > Use a workflow: run the workflow script at proof/roles-check.workflow.js

   Then run X-ray on the "Transcript dir" it prints:

   ```
   node bin/lean-swarm.js xray <transcript-dir>
   ```

   Pass if every `lean-swarm:*` type starts at 30k tokens or less, has no skill listing, and returned a result.

3. **Set a budget.** Look up a similar past run in X-ray. One plain run of 7 agents reads a few million tokens, mostly cached, depending on your setup. Four runs cost about three plain runs, since the lean ones are smaller.

4. **Run it four times, alternating,** in the same session and on the same day. Replace `<abs>` with the absolute path of this repo:

   > Use a workflow: run proof/review.workflow.js with args {"variant": "plain", "target": "<abs>/proof/target"}

   Then `"lean"`, then `"plain"`, then `"lean"`. Note each run's "Transcript dir".

5. **Score the output:**

   ```
   node proof/score.js <plain-1> <lean-1> <plain-2> <lean-2>
   ```

6. **Compare tokens and time:**

   ```
   node bin/lean-swarm.js xray --compare <plain-1>,<plain-2> --vs <lean-1>,<lean-2>
   ```

   The gap between the two plain runs is the noise floor.

7. **Write it up** in `docs/proof/<date>-review.md`: both tables, the setup (CLI version, model, how many connectors and skills), the noise floor, and the limits. The claim is "on this workflow, with this setup".

## Round 2: a harder target

Round 1's target was too easy: both variants found all six bugs every time, so it couldn't show a quality difference. Its agents were also very short (about 2 turns each), which makes the token saving look bigger than it would be on longer work.

`target-2/` is a larger library (10 files) with **11 subtler planted bugs** (`grading/key-2.json`) and **15 decoys**: correct functions that look suspicious, such as a documented in-place sort or a deliberate `== null`. `test/proof2.test.js` runs the library to prove each planted bug breaks its JSDoc and each decoy doesn't.

Run it the same way, with `target-2` as the target and the round-2 key when scoring:

```
node proof/score.js --key proof/grading/key-2.json <runs...>
```

The score now also counts **decoy hits**: findings that flag correct code.

`node proof/timing.js <runs...>` breaks each run down by stage (find, verify, report). It shows turns, model time per turn, tool time, output, and whether each agent's first turn found its start already cached. Use it to explain wall-clock differences.
