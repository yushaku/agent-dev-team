# Software Dev Agent Team

A process for a team of coding agents working a software project inside the Orca app. A human Product Owner approves at fixed gates (business spec, new screens, delivery); an Orchestrator, which can be any coding agent, sizes the work, dispatches role workers (PM, Designer, Tech Lead, Builder, QA, reviewers, Delivery) and ends at a draft PR or a committed branch. Per-project specifics live in a project config, `.team/config.yaml`.

## How it works

Who hands work to whom: the PO talks to the Orchestrator and to discussion sessions; the Orchestrator dispatches every worker.

![Who hands work to whom](diagrams/team-overview.svg)

The main flow for a new capability (S3), with the PO's gates:

![Main dev flow](diagrams/dev-flow.svg)

What each request size runs:

![What each size runs](diagrams/sizes.svg)

## Requirements

- Orca app
- A coding agent CLI, such as Claude Code or Codex
- `gh`
- `node`, for `npx skills`

## Install

1. Clone this repo to `~/.agents/teams`, or elsewhere and set `AGENT_TEAM_HOME`.
2. Install the pinned downloaded skills with the command in `orchestrator/revising.md`.
3. Link the team's own skills: `ln -s $AGENT_TEAM_HOME/skills/* ~/.agents/skills/`

## Quickstart

1. In a project repo, run `/init-team` to create `.team/config.yaml`.
2. Run `/orchestrator <job>`.

## Layout

- `workflow.md`: locations, goals, principles, flow, gates, Definition of Done
- `sizing.md`: request sizes S0 to S3 and work modes
- `roles/`: one card per role, including the Orchestrator
- `orchestrator/`: the Orchestrator's step files
- `config.md`: project config schema and model settings
- `coding-agents.md`: agent registry, model tiers, routing, quota
- `docs-policy.md`: which documents exist and who owns them
- `orca.md`: Orca state conventions
- `maintenance.md`: process for projects in production
- `skills/`: skills the team wrote
- `skills-lock.json`: pinned downloaded skills
- `scripts/`: helpers such as the quota probe
- `templates/`: file templates for projects
- `diagrams/`: architecture diagrams
- `dashboard/`: local dashboard

## Metrics (from Orca history, monthly)

- Lead time: idea to delivery.
- Fix rounds per task (target: 1 or fewer).
- Escaped defects found after merge.
- PO touch time outside the gates.
- Doc weight: committed docs and lines in `docs/` grow with capabilities, not features.
- Tokens per delivered Task, and the Orchestrator's share versus workers (team dashboard, 127.0.0.1:4747).

## Dashboard

`python3 dashboard/server.py`, then open http://127.0.0.1:4747. See `dashboard/README.md`.
