# Workflow

The PO gives a software change to the Orchestrator. The team delivers a reviewed change as a draft PR or committed branch; merge, release and deployment follow the PO's authorization.

## Default flow

The Orchestrator and the PO run `grill-with-docs`, `to-spec` and `to-tickets` (Gate 1: spec and seams, then tickets and blocking edges). Each ticket becomes one Orca Task; blocking edges are Task dependencies. One Builder builds the tickets test-first, measures the changed behavior, updates related docs and prepares delivery. One independent Reviewer on a different agent runs `code-review` on tickets, code, evidence and risks. The Builder resolves blocking findings in the fix round. The Orchestrator delivers the reviewed change at Gate 2.

Planning, build and review share the Orchestrator's Orca worktree and feature branch, with separate agent sessions. Workspace selection and isolation exceptions follow `skills/orchestrator/references/start.md` "Shared feature workspace".

The Orchestrator adds specialists only for a named decision or evidence gap. Project requirements and risk-triggered checks remain in force when responsibilities are combined.

## Decisions and evidence

- The PO owns scope, business rules and acceptance of delivery. Gate 1 covers the spec and tickets; G-UI applies when a prototype ran. Ticket reply/scope gates are in `gates.md` below.
- Within approved scope, agents choose implementation details. New scope or unresolved risks return to the PO.
- Orca holds status, ownership and dependencies. Code/tests explain implementation; the approved spec and tickets state intended behavior. Reports link execution evidence rather than claiming "done".

## Read by responsibility

Paths below are relative to the team root; workers receive their Task and role skill, not the whole process.

| Need | Source |
|---|---|
| Plan (grill, spec, tickets), select team, resume | `skills/orchestrator/references/start.md` |
| Task input, worker communication and reports | `skills/orchestrator/references/specs.md` |
| PO gates and scope changes | `skills/orchestrator/references/gates.md` |
| Review and fix rounds | `skills/orchestrator/references/review.md` |
| Delivery and completion | `skills/orchestrator/references/delivery.md` |
| Production tickets | `skills/orchestrator/references/tickets.md` |
| Project schema/defaults | `skills/init-team/references/config-schema.md`; model routing and skill slots `skills/orchestrator/references/routing.md` |
| Write or review documentation | Relevant sections of `docs-policy.md` |
| Role-specific responsibilities | `skills/team-<role>/SKILL.md` and its `references/` (workers); groups defined in `README.md` "Workers and commands" |

## Locations

- Team root `$AGENT_TEAM_HOME`: directory holding this file, default `~/.agents/teams`.
- Shared skills `$AGENT_SKILLS_DIR`: default `~/.agents/skills`.
- Per-project config and Run artifacts live in `.team/`, linked into worktrees.
