# Software Dev Agent Team

- Scope: any software project (web, mobile, desktop, backend, CLI).
- Per-project specifics (stack, platform skills, commands, tracker, branches, delivery) load at run time from the project config (`config.md`).
- Output ends at a delivered change: a draft PR or a committed branch. Humans merge, release and deploy outside this process.

## Locations

- Team root `$AGENT_TEAM_HOME`: the folder holding this file (default `~/.agents/teams`). Paths in these docs are relative to it.
- Shared skills dir `$AGENT_SKILLS_DIR` (default `~/.agents/skills`).
- Scratch dir `$AGENT_TEAM_SCRATCH` (default: the system temp dir): tmux sessions and quota probes (`coding-agents.md`).

## Files

Read this file first; open the others only for the step at hand.

| File | Read when |
|---|---|
| `sizing.md` | Sizing a request (S0 to S3), picking a work mode |
| `workflow.md` | Building the Run: flow, gates, Task DAG, Definition of Done, escalation |
| `roles/orchestrator.md` | You are the Orchestrator (any agent): core, routes to `orchestrator/*.md` |
| `roles/<role>.md` | Writing a worker's Task spec: paste the role card with `{slots}` resolved from config |
| `config.md` | Reading `.team/config.yaml`: schema, defaults, model settings, skill slots |
| `coding-agents.md` | Dispatching a worker: agent registry, model tiers, routing, quota, free-tier agents |
| `docs-policy.md` | Any step that writes a document (spec, ADR, README, scratch) |
| `orca.md` | Creating or updating Orca state |
| `maintenance.md` | Project in production, work arrives as tickets (differences from dev only) |
| `skills-lock.json` | Installing or adding a downloaded skill a role card or config.md names (`orchestrator/revising.md`) |
| `skills/<name>/` | Skills the team wrote (linked into `~/.agents/skills`); downloaded skills live only in `~/.agents/skills` |

## Goals

- Idea to reviewed, tested change, with a human Product Owner (PO) approving only at fixed gates: Gate 1 (business spec), G-UI (new screens, when the project turns it on), Gate 2 (delivery); maintenance adds its reply and scope gates.
- Reuse shared skills in `~/.agents/skills` and the project's own skills; these docs only assign them to roles.
- One owner per concern: team layer (roles, Orca, gates, tiers, docs policy) is ours; worker process uses `tdd`, `diagnosing-bugs`, `codebase-design`; lean code and Standards review use `ponytail` / `ponytail-review`; domain checklists load via a role card or slot only when the work touches the domain.

## Principles

1. **Separate sessions:** the PO gives work to the Orchestrator (any coding agent in an Orca terminal), which dispatches everyone else; the PO discusses with the Researcher, whose report (`.team/research/`, `todo.md`) the Orchestrator reads, or with the Solution Architect. No chat between a discussion session and the Orchestrator.
2. **Orca tracks, code is the truth:** no markdown boards; status, ownership, dependencies, gates live in Orca; how the system works is answered by code and tests; what the business wants, by the business spec.
3. **Process here, specifics in config:** no project stack, platform, command or branch name; agents and trackers are process.
4. **Few documents, one owner each:** `docs-policy.md`.
5. **Say it once:** `docs-policy.md` "Writing".
6. **Smallest thing that works:** for code and docs; reviewers flag unnecessary docs like unnecessary code.
7. **Evidence, not claims:** "done" means command output, a test run, a screenshot or a URL in `worker_done` or the delivery report.
8. **Bounded:** `workflow.md` "Escalation"; concurrent agents capped by project config (`flow.max_concurrent_agents`).

## Product Owner

- **Product Owner:** owns priorities, scope, Gate 1 and Gate 2.

## Roster

- [Product Manager (business spec)](roles/pm.md)
- [UX / UI Designer](roles/designer.md)
- [Tech Lead](roles/tech-lead.md)
- [Builder](roles/builder.md)
- [QA / Test Engineer](roles/qa.md)
- [Anti-AI Editor](roles/anti-ai.md)
- [Code Reviewer](roles/reviewer.md)
- [Security Auditor](roles/security.md)
- [Performance & Accessibility Auditor](roles/perf-a11y.md)
- [Delivery Engineer](roles/delivery.md)
- [Researcher](roles/researcher.md)
- [Solution Architect](roles/solution-architect.md)
- [Orchestrator](roles/orchestrator.md)

## Agent rules

- Agent registry, model tiers, routing and quota: `coding-agents.md`; role cards state tier, capability and preference only.
- Claude specifies, designs, reviews.
- Free-tier agents (copilot, cursor) run fast-tier `simple` Tasks only and never review (`coding-agents.md` "Free-tier agents").
- Never assign free-tier agents PM, Designer, Tech Lead, Reviewer, Security, QA, Perf/A11y, Anti-AI, Delivery, logic-building, spec, design or review work.
- Disable an agent with `models.agents.<agent>: off` (`config.md`); fallback: `coding-agents.md` "Free-tier agents".
- Builder and Reviewer use different agents.

## Metrics (from Orca history, monthly)

- Lead time: idea to delivery.
- Fix rounds per task (target: 1 or fewer).
- Escaped defects found after merge.
- PO touch time outside the gates.
- Doc weight: committed docs and lines in `docs/` grow with capabilities, not features.
- Tokens per delivered Task, and the Orchestrator's share versus workers (team dashboard, 127.0.0.1:4747).
