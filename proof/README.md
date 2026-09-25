# Proof run: plain vs lean agents

This kit runs one real multi-agent workflow twice each way and compares tokens, time and output.

- **The task:** review `target/`, a small library with six planted bugs. Each bug is a place where the code breaks its own JSDoc. `grading/key.json` lists them.
- **The workflow:** `review.workflow.js`. Three reviewers (one lens each) → three checkers → one judge that merges the lists: 7 agents. The plain and lean variants use identical prompts. The only difference is the agent type: default agents, or `lean-swarm:reviewer` and `lean-swarm:judge`. `test/proof.test.js` checks this.
- **Scoring:** `score.js` counts the planted bugs in the judge's final list (same file, line within 3) and lists other findings. It also flags any run whose agents touched `grading/`.

## Why it needs a fresh session

Claude Code loads agent definitions only when a session starts. The lean roles must be installed before the session that runs the proof begins.

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
