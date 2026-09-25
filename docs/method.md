# How X-ray computes each number

X-ray reads Claude Code's local transcripts. It never changes them and never sends them anywhere.

## Where the data comes from

- **Workflow runs:** `~/.claude/projects/<project>/<session>/subagents/workflows/<run>/agent-<id>.jsonl`, plus `agent-<id>.meta.json` (agent type, label, workflow phase).
- **Plain subagents** (the Agent tool): `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl` and `.meta.json`. X-ray groups one session's plain subagents as one run.
- **One turn** is one model reply. Claude Code writes a reply as several lines with the same message id. X-ray counts the reply once: input and cache fields come from its first line with usage, and output tokens from the largest value seen on its lines.

## Tokens

- **Tokens read** per turn = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. That is everything the model read, cached or not.
- **Tokens written** = `output_tokens`, including thinking.
- **Tokens by kind:** uncached input, cache read, cache write, output. X-ray always uses billed counts from the usage fields, never text length.

## Fixed start

- **First-turn context** of an agent = tokens read on its first turn. It's everything loaded before the agent does any work: system prompt, tool definitions, instruction files, listings and the task.
- **Fixed start share** = Σ(first-turn context × turns) ÷ Σ tokens read. Every later turn re-reads that start, so this is the share of reading that is the same start over and over. Reported token-weighted over all runs, and as the median per run. Same definition as the prototype `wfall.js`.

## What fills the first turn

- Parts come from the transcript: the `prompt_snapshot` attachment (system prompt, and tool definitions on CLI versions that log them), the instruction-file attachment (split into CLAUDE.md, MEMORY and rules files by path), `skill_listing`, `deferred_tools_delta`, other attachments, and the task (the first user message). Each part is measured in characters of text.
- **When the log holds tool definitions** (CLI 2.1.250 and nearby): the billed first-turn total is split between parts by each part's share of characters.
- **When it doesn't** (2.1.282 does not log tool definitions): logged parts are estimated at 3.6 characters per token, the ratio the prototype `prefix.js` used. The rest of the billed total is shown as "not in the log". It is mostly tool definitions.

## Cost

- **Price-weighted cost** uses Anthropic's list prices per model (`src/prices.js`, with its source date): input, output, cache reads (0.1× input, or the model's own rate: 0.05× on Opus 5.5, 0.025× on Fable 5.1), 5-minute cache writes (1.25× input) and 1-hour cache writes (2× input). Writes not split by TTL count as 5-minute.
- **Re-read share of cost** = cache-read cost ÷ total cost, median per run.
- **API-price equivalent** is the same cost in dollars. On a subscription it is a comparison unit, not a bill.
- The prototype used fixed weights (cache read 0.1, every write 1.25, output 5). X-ray's per-model prices give a lower re-read share when runs use Opus 5.5 or 1-hour writes. On the 4-agent test run: 3% vs the prototype's 6%.

## Tool use

- **Called:** share of agents that called each tool at least once (the prototype `timeuse.js`).
- **Loaded but never called:** tools in an agent's tool definitions that no agent called. Only available where the log holds tool definitions.
- **Any browser tool:** share of agents that called any tool whose name mentions browser, chrome, playwright or puppeteer.

## Time

Same method as `timeuse.js`. X-ray walks each agent's timestamped lines in order. The gap before a line goes to what that line is: a model reply is model time, a tool result is time for that tool, anything else is "other". Gaps over 30 minutes (machine asleep or paused) and negative gaps are dropped.

- **Seconds per turn** = counted time ÷ turns.
- **Wall-clock per run** = last timestamp − first timestamp across the run's agents.

## Turns

- **Calls per turn** = tool calls ÷ turns.
- **Turns with exactly one call** = replies with exactly one `tool_use` block ÷ all turns.

## Duplicate reads

Same keys as `wfall.js`: a file path (lowercased, `\` → `/`), a URL (without query, fragment or trailing slash), or a Grep or Glob pattern with its path. Each agent contributes each key once. For each key read by n agents, n − 1 reads are duplicates. The run's duplicate share = duplicates ÷ all reads.

**Reads through the shell count too.** Agents often print files with Bash instead of the Read tool (`cat -n`, `sed -n '10,40p'`, `head`). In the first proof run, reviewers read every file that way, and the tool-only count saw no reads at all. X-ray also takes file keys from plain reader commands in Bash or PowerShell: `cat`, `head`, `tail`, `nl`, `sed` (not `sed -i`), `bat`, `less`, `more`, `type`, `Get-Content`. Relative paths resolve against the line's working directory, following `cd`. Globs, variables and `grep` don't count. The report also gives the tool-only share, the prototype's definition, for comparison.

## Models

The Opus share of a run = turns on an Opus model ÷ all turns. The prototype counted transcript lines instead of turns, so on the test run it reads 40% where X-ray reads 50%.

## What you could cut

- **Fitting a role:** each agent gets the leanest role whose tools cover every tool it called. The roles are in `src/roles.js`. StructuredOutput, SubagentHandback and ToolSearch don't count, because a role gets them anyway or doesn't need them. PowerShell counts as Bash.
- **Saving per turn:** the skill listing and deferred-tool listing, plus the definitions of tools the role leaves out. Agents that already start without those listings already have a tools allowlist, so they save nothing.
  - Where the log holds tool definitions, this is exact, up to the character split.
  - Where it doesn't, it's a range. The low end is the listings alone. The high end is the listings plus everything not in the log, minus a floor: the median unlogged start of agents in your logs that already have an allowlist. Those agents show how much a lean agent still carries outside the log (its own few tool definitions and the like).
  - On the test run, the default agent's range is 7.5k–39.8k per turn. A 2-tool agent in the same session measured 36.4k less than the default (45.1k vs 8.7k), which falls inside the range.
- **Tokens read saved** = saving per turn × the agent's turns, because the start is re-read on every turn.

## Checked against the prototypes

On the same 4-agent run, X-ray and the prototype scripts agree on agents, turns, tokens read, fixed-start share, duplicate reads, one-call turns and the time split. The two differences are the price weights and the Opus share, explained above.
