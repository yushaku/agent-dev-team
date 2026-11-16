# Workflow

The PO gives a software change to the Orchestrator. The team delivers a reviewed change as a draft PR or committed branch; merge, release and deployment follow the PO's authorization.

## Default flow

One Builder diagnoses, implements, tests, measures the changed behavior, updates related docs and prepares delivery. One independent Reviewer checks requirements, code, evidence and risks. The same workers resolve blocking findings and deliver at Gate 2.

The Orchestrator adds specialists only for a named decision or evidence gap. Project requirements and risk-triggered checks remain in force when responsibilities are combined.

## Decisions and evidence

- The PO owns scope, business rules and acceptance of delivery. Gate 1 covers new/changed business rules; G-UI applies when configured. Ticket reply/scope gates are in `gates.md` below.
- Within approved scope, agents choose implementation details. New scope or unresolved risks return to the PO.
- Orca holds status, ownership and dependencies. Code/tests explain implementation; approved business specs state intended behavior. Reports link execution evidence rather than claiming "done".

## Read by responsibility

Paths below are relative to the team root; workers receive their Task and role card, not the whole process.

| Need | Source |
|---|---|
| Coordinate, select team, resume | `skills/orchestrator/references/start.md` |
| Create Task input or write a report | `skills/orchestrator/references/specs.md` |
| PO gates and scope changes | `skills/orchestrator/references/gates.md` |
| Review and fix rounds | `skills/orchestrator/references/review.md` |
| Delivery and completion | `skills/orchestrator/references/delivery.md` |
| Production tickets | `skills/orchestrator/references/tickets.md` |
| Project schema/defaults | `config.md`; platform presets belong to `init-team` |
| Write or review documentation | Relevant sections of `docs-policy.md` |
| Role-specific responsibilities | `roles/<role>.md` |

## Locations

- Team root `$AGENT_TEAM_HOME`: directory holding this file, default `~/.agents/teams`.
- Shared skills `$AGENT_SKILLS_DIR`: default `~/.agents/skills`.
- Per-project config and Run artifacts live in `.team/`, linked into worktrees.
