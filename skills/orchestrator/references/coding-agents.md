# Coding agents

Source of truth for agents, models, routing and limits. Role cards state requirements only.

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
2. Require the role's tier/capabilities and config eligibility. Keep Builder and Reviewer independent; free-tier restrictions are below.
3. Use the role's preferred eligible agent; otherwise choose an available eligible agent. No eligible agent: report the blocker; never silently lower the tier or drop a required check.
4. Handle authentication, unavailable models or rate-limit errors only when observed, using `start.md` recovery and the fallback below.
5. Orchestrator, Researcher and Solution Architect sessions use their session model; the Solution Architect worker (`arch-review`) uses tier top.

## Free-tier agents

- `copilot`/`cursor`: fast-tier Tasks explicitly marked `simple` by Orchestrator or Tech Lead (`roles/tech-lead.md` "Simple Tasks"); never review.
- For a `simple` Task, use the configured/preferred eligible free-tier agent; no usage probe.
- Fallback: if both are unavailable/exhausted, or the Task fails once (quota, sign-in, verify or `worker-start: start_failed`), rerun on `codex`/`claude` fast via Routing; notify PO in one line. No second attempt on the same free-tier agent; preserve fix round and retry history.
- A role whose tier `models.roles` or a task-specific override lifts above fast leaves free-tier agents.

## Known limits

Permissions/capabilities are session-specific. Attempt authorized work; recover from actual errors, not assumed commit or symlink restrictions.

- Git write denied: report changed paths, verify evidence and commit text. Use environment approval or an authorized committer; preserve user changes; do not rerun checks solely because the committer changed.
- `.team` link denied: report its resolved destination/access and request narrow permission through the environment.
- Supply absolute skill paths and explicit action boundaries in Task specs (`specs.md`), regardless of agent.

## Permission prompts

- Report exact command, error and worker. Simplify compound commands only within the authorized action; never bypass a denial or change global permissions automatically.
- A missing CLI, sign-in failure or unavailable model follows `start.md` recovery and the routing constraints above.

## Transcripts

Ask the worker to supply a missing report first. If it cannot, use version-matched Orca inspection and the exact session identified by its receipt. Do not assume a transcript path or format from the agent name.
