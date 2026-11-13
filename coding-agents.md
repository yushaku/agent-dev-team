# Coding agents

Owner of everything agent-specific: registry, model ids, routing, quota, free-tier rules. Role cards state requirements only.

## Registry

| Agent (Orca `--agent` id) | Tiers | Capabilities | Quota source | Plan |
|---|---|---|---|---|
| `claude` | fast, work, top | specify, design, review | `/usage` in tmux (`scripts/quota.py`) | Ultra |
| `codex` | fast, work, top | sandboxed build | last `rate_limits` in `~/.codex/sessions` (`scripts/quota.py`) | Pro |
| `copilot` | fast | simple edits | `gh api /copilot_internal/user` (`scripts/quota.py`) | Free (200 chats per month, 0 premium) |
| `cursor` | fast | simple edits | `/usage` in tmux (`scripts/quota.py`) | Free |

- `copilot` and `cursor` are free-tier agents: see "Free-tier agents".
- Adding an agent = one registry row + one probe in `scripts/quota.py` + one column in "Model tiers"; role cards never change.
- Orca must launch it: `orca orchestration worker-start --help` lists the `--agent` ids.
- Per-project on/off: `config.md` `models.agents`.

## Model tiers

| Tier | `claude` | `codex` | `cursor` | `copilot` | Effort |
|---|---|---|---|---|---|
| top | `opus` | `gpt-6-astra` | not run | not run | `high` |
| work | `sonnet` | `gpt-6.1-sol` | not run | not run | `medium` |
| fast | `haiku` | `gpt-6-luna` | `auto` | no flags | `low` |

- Model ids live only in this table; role cards name the tier, with any size rule.
- `copilot`: pass neither `--model` nor `--effort`.
- `cursor`: `--model auto`, no `--effort`; on Free keep `auto`.
- `claude` `haiku` Tasks do not take `--effort`.
- `--effort` requires `--model`.
- Project remaps and effort steps: `config.md` "Model settings".

## Routing

Before each dispatch wave, pick an agent for every Task:

1. Run `python3 $AGENT_TEAM_HOME/scripts/quota.py` (cached 15 minutes; `--fresh` bypasses).
2. Eligible = agents enabled in `models.agents` that can run the role's tier, have the role's required capability, and break no hard constraint.
3. Hard constraints: Reviewer and Anti-AI never use the agent that built or wrote the change; Builder and Reviewer use different agents; a free-tier agent only takes a Task marked `simple`.
4. Among eligible agents with `ok: true`, pick the one with the highest `remaining_pct`.
5. The role card's `prefers <agent>` breaks ties.
6. An agent with `ok: false` is eligible only when no other agent is; never skip a hard constraint to use it.
7. No eligible agent: wait for the PO's decision; never lower the tier or drop a capability.
8. Do not record the choice or its reason in the Task spec.
9. Orchestrator, Researcher and Solution Architect sessions run on the session's own model; the Solution Architect worker (`arch-review`) is tier top.

## Quota

- `python3 $AGENT_TEAM_HOME/scripts/quota.py [--fresh]` prints JSON `{agent: {used_pct, remaining_pct, window, resets_at, plan, source, ok, error}}` for `claude`, `codex`, `copilot`, `cursor`.
- Cache: `~/.cache/agent-team/quota.json`, 15 minutes.
- Probe failure sets `ok: false` and `error`; a missing CLI is a failure, never a crash.
- `codex` reads the last logged sample; `sample_age_min` shows how old it is.
- `claude` and `cursor` start their TUI in a `q_claude` / `q_cursor` tmux session under the scratch dir (`$AGENT_TEAM_SCRATCH`; trusted by both) and run `/usage`.

## Free-tier agents

- `copilot` and `cursor` run fast-tier `simple` Tasks only and never review.
- `simple` is marked by the Tech Lead (`roles/tech-lead.md` "Simple Tasks"); Tasks not marked `simple` never go to a free-tier agent.
- Never assign them PM, Designer, Tech Lead, Reviewer, Security, QA, Perf/A11y, Anti-AI, Delivery, logic-building, spec, design or review work.
- A `simple` Task goes to whichever of `copilot` and `cursor` has more `remaining_pct`.
- Fallback: both exhausted or unavailable, or the Task fails once there (allowance exhausted, CLI not signed in, or verify fails once): rerun it on `codex` or `claude` at tier fast (Routing), and tell the PO one line.
- Never a second attempt on the same free-tier agent; the rerun starts the verify-round count at zero.
- A role whose tier `models.roles` or a size rule lifts above fast leaves free-tier agents.
- A `worker-start` that returns `start_failed` (for example `agent_prompt_blocked`) follows the same fallback (`orchestrator/supervise.md` "Failures and recovery").
