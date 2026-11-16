# Coding agents

Owner of everything agent-specific: registry, model ids, routing, free-tier rules, per-agent limits. Role cards and other references state requirements only.

## Registry

| Agent (Orca `--agent` id) | Tiers | Capabilities | Sign-in check |
|---|---|---|---|
| `claude` | fast, work, top | specify, design, review | `claude auth status` |
| `codex` | fast, work, top | sandboxed build | `codex login status` |
| `copilot` | fast | simple edits | none: dispatch and follow `start.md` on failure |
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

- Model ids live only in this table; role cards name the tier, with any task-specific override.
- `copilot`: pass neither `--model` nor `--effort`.
- `cursor`: `--model auto`, no `--effort`.
- `claude` `haiku` Tasks do not take `--effort`; `--effort` requires `--model`.
- A fix round with several behaviours stays at tier work.
- Project remaps and effort steps: `config.md` "Model settings".

## Routing

Choose agents without probing account usage or remaining quota:

1. Honor explicit PO choices and project `models` settings.
2. Eligible agents must support the role's tier/capabilities and be enabled in config. Builder and Reviewer remain independent; free-tier agents take only `simple` Tasks and never review.
3. Use the role's preferred eligible agent; otherwise choose an available eligible agent. No eligible agent: report the blocker; never silently lower the tier or drop a required check.
4. Handle authentication, unavailable models or rate-limit errors only when observed, using `start.md` recovery and the fallback below.
5. Orchestrator, Researcher and Solution Architect sessions use their session model; the Solution Architect worker (`arch-review`) uses tier top.

## Free-tier agents

- `copilot` and `cursor` run fast-tier `simple` Tasks only and never review. `simple` is marked by the Orchestrator or Tech Lead (`roles/tech-lead.md` "Simple Tasks"); a Task not marked `simple` never goes to them.
- For a `simple` Task, use the configured/preferred eligible free-tier agent; no usage probe.
- Fallback: both exhausted or unavailable, or the Task fails once there (allowance exhausted, CLI not signed in, verify fails once, or `worker-start` returns `start_failed`): rerun it on `codex` or `claude` at tier fast (Routing) and tell the PO one line. Never a second attempt on the same free-tier agent; preserve the current fix round and Orca retry history.
- A role whose tier `models.roles` or a task-specific override lifts above fast leaves free-tier agents.

## Known limits

Treat permissions and runtime capabilities as session-specific. Attempt authorized work within the active permissions; use the actual error to choose recovery rather than assuming an agent cannot commit or write through a link.

- If git writes are denied, report exact changed paths, verification evidence and proposed commit text. Use the environment's approval mechanism or an authorized worker to commit; preserve user changes and do not repeat checks solely because the committer changed.
- If a `.team` link is denied, identify its resolved destination and required access. Request the narrow permission through the environment; do not edit global permissions automatically.
- Supply absolute skill paths and explicit action boundaries in Task specs (`specs.md`), regardless of agent.

## Permission prompts

- On a permission failure, report the exact command, error and worker. Simplify a compound command only if it still performs the authorized action; never bypass a denial.
- A missing CLI, sign-in failure or unavailable model follows `start.md` recovery and the routing constraints above.

## Transcripts

Ask the worker to supply a missing report first. If it cannot, use version-matched Orca inspection and the exact session identified by its receipt. Do not assume a transcript path or format from the agent name.
