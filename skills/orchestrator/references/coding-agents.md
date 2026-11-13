# Coding agents

Owner of everything agent-specific: registry, model ids, routing, quota, free-tier rules, per-agent limits. Role cards and other references state requirements only.

## Registry

| Agent (Orca `--agent` id) | Tiers | Capabilities | Sign-in check |
|---|---|---|---|
| `claude` | fast, work, top | specify, design, review | `claude auth status` |
| `codex` | fast, work, top | sandboxed build | `codex login status` |
| `copilot` | fast | simple edits | none: dispatch and follow `supervise.md` on failure |
| `cursor` | fast | simple edits | `cursor-agent status` |

- `copilot` and `cursor` are free-tier agents: see "Free-tier agents".
- Per-project on/off: `config.md` `models.agents`.

## Model tiers

Defaults; a project overrides them in `config.md` `models`.

| Tier | `claude` | `codex` | `cursor` | `copilot` | Effort |
|---|---|---|---|---|---|
| top | `opus` | `gpt-6-astra` | not run | not run | `high` |
| work | `sonnet` | `gpt-6.1-sol` | not run | not run | `medium` |
| fast | `haiku` | `gpt-6-luna` | `auto` | no flags | `low` |

- Model ids live only in this table; role cards name the tier, with any size rule.
- `copilot`: pass neither `--model` nor `--effort`.
- `cursor`: `--model auto`, no `--effort`.
- `claude` `haiku` Tasks do not take `--effort`; `--effort` requires `--model`.
- A fix round with several behaviours stays at tier work.
- Project remaps and effort steps: `config.md` "Model settings".

## Routing

Before each dispatch wave, pick an agent for every Task:

1. Run `python3 $AGENT_TEAM_HOME/scripts/quota.py` (see "Quota").
2. Eligible = agents enabled in `models.agents` that can run the role's tier, have the role's required capability, and break no hard constraint.
3. Hard constraints: Reviewer and Anti-AI never use the agent that built or wrote the change; Builder and Reviewer use different agents; a free-tier agent only takes a Task marked `simple`.
4. Among eligible agents with `ok: true`, pick the one with the highest `remaining_pct`.
5. The role card's `prefers <agent>` breaks ties.
6. An agent with `ok: false` is eligible only when no other agent is; never skip a hard constraint to use it.
7. No eligible agent: wait for the PO's decision; never lower the tier or drop a capability.
8. Orchestrator, Researcher and Solution Architect sessions run on the session's own model; the Solution Architect worker (`arch-review`) is tier top.

## Quota

- `python3 $AGENT_TEAM_HOME/scripts/quota.py [--fresh]` prints JSON per agent: `used_pct`, `remaining_pct`, `ok`, `error`. Cached 15 minutes; `--fresh` bypasses.
- A probe failure sets `ok: false`; a missing CLI is a failure, never a crash. `codex` reads its last logged sample (`sample_age_min` shows its age).

## Free-tier agents

- `copilot` and `cursor` run fast-tier `simple` Tasks only and never review. `simple` is marked by the Tech Lead (`roles/tech-lead.md` "Simple Tasks"); a Task not marked `simple` never goes to them.
- A `simple` Task goes to whichever of the two has more `remaining_pct`.
- Fallback: both exhausted or unavailable, or the Task fails once there (allowance exhausted, CLI not signed in, verify fails once, or `worker-start` returns `start_failed`): rerun it on `codex` or `claude` at tier fast (Routing) and tell the PO one line. Never a second attempt on the same free-tier agent; the rerun starts the verify-round count at zero.
- A role whose tier `models.roles` or a size rule lifts above fast leaves free-tier agents.

## Known limits

- `codex`: in a worktree of the main checkout it cannot `git add`; its Builder specs say not to commit and to report changed paths (`specs.md`), and its Delivery specs are edit-only, with no commits.
- `codex`: writes through the `.team` link only when `<main checkout>/.team` is in `sandbox_workspace_write.writable_roots` of `~/.codex/config.toml`.
- `codex`: stops before reading files when a spec says "ask for everything else"; list what needs approval instead.
- `claude`: skips bare skill names; give absolute `SKILL.md` paths (`specs.md`).

## Permission prompts

- Keep each shell command simple: one per call, no shell variables, no semicolon chains. Compound commands miss a sandbox allowlist and stall the worker on a prompt.
- `claude` shows "Allow Bash?" and `codex` fails with EPERM; follow the orchestrating agent's permission notes for the lasting fix.

## Transcripts

- A `claude` `worker_done` that points to "the full report" sent it earlier as `status`: find it in the `tool_use` inputs of `~/.claude/projects/<worktree path with / as ->/<session id>.jsonl`, with the session id from `worker-read`.
