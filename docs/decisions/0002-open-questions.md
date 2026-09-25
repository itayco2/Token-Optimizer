# 0002: Answers to the v1 open questions

- **Date:** 2026-09-25
- **How:** a 4-agent workflow run in a Claude Code on the web session (CLI 2.1.282, Opus 5.5), plus the docs. The transcripts are the test fixtures in `test/fixtures/`, with their content removed.

## Q1: Does an agent with a tools allowlist still return structured output?

**Yes.** In the run, two built-in agent types with allowlists, `statusline-setup` (Read, Edit) and `claude-code-guide` (Glob, Grep, Read, WebFetch, WebSearch), both had a `schema` and both called StructuredOutput. So did the default agent and Explore. `test/logs.test.js` checks this on the fixtures.

## Q2: Are allowlisted tools like WebFetch loaded directly, without ToolSearch?

**Yes.** `claude-code-guide` listed WebFetch and WebSearch among its own tools, never called ToolSearch, and started without a deferred-tool listing. In the default agent, WebFetch and WebSearch were deferred (loaded through ToolSearch).

## Q3: What name does a workflow use for a plugin agent?

**`lean-swarm:reader`** (plugin name, colon, agent name), per the plugin manifest docs: "an agent `reviewer` in plugin `deploy-tools` appears as `deploy-tools:reviewer`". Workflow `agent()` resolves `agentType` from the same registry as the Agent tool. Not yet checked in a live run, because a session only loads agent definitions when it starts (see below).

## Q4: Do plain Agent-tool subagents use the same log format?

**Yes.** They are at `<session>/subagents/agent-<id>.jsonl` with a `.meta.json`, next to the `workflows/` folder, with the same line types and usage fields. X-ray reads both. The docs say otherwise, but the files are on disk.

## Also learned

- **CLI 2.1.282 no longer logs tool definitions** in `prompt_snapshot` (2.1.250 did). X-ray splits the first turn exactly on older logs and estimates on newer ones (see `docs/method.md`).
- **Agent definitions load only when a session starts.** An agent file added mid-session, at user or project level, is not found. Lean roles therefore need a new session.
- **Measured in this cloud setup** (225 deferred tools, mostly from connectors; 29 skills; no CLAUDE.md), first turn:

  | Agent type | Tools | First turn |
  |---|---|---:|
  | default workflow agent | all | 45,086 |
  | Explore | all but edit tools | 34,030 |
  | claude-code-guide | 5 (long docs system prompt) | 14,455 |
  | statusline-setup | 2 | 8,686 |

  An allowlist cut the start by 68–81% here, against 57% on Itay's machine (68k → 29k, with instruction files).
- **Cloud sessions don't load a repository's plugin marketplace** (`extraKnownMarketplaces` needs the workspace trust prompt, which they never show). They do load project agents from `.claude/agents/`, so the repo keeps exact copies of the roles there, and the proof workflows take a `rolePrefix` argument.
- **Plugin agents support** `tools`, `model`, `effort`, `omitClaudeMd` and others. They ignore `hooks`, `mcpServers`, `permissionMode` and `initialPrompt`.
