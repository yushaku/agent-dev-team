# Workflow

- Scope: any software project (web, mobile, desktop, backend, CLI).
- Per-project specifics (stack, platform skills, commands, tracker, branches, delivery) load at run time from the project config (`config.md`).
- Output ends at a delivered change: a draft PR or a committed branch. Humans merge, release and deploy outside this process.

## Locations

- Team root `$AGENT_TEAM_HOME`: the folder holding `workflow.md` (default `~/.agents/teams`). Paths in these docs are relative to it.
- Orchestrator references: `skills/orchestrator/references/`.
- Shared skills dir `$AGENT_SKILLS_DIR` (default `~/.agents/skills`).
- Scratch dir `$AGENT_TEAM_SCRATCH` (default: the system temp dir): tmux sessions and quota probes (`skills/orchestrator/references/coding-agents.md`).

## Goals

- Idea to reviewed, tested change, with a human Product Owner (PO) approving only at fixed gates: Gate 1 (business spec), G-UI (new screens, when the project turns it on), Gate 2 (delivery); ticket mode adds its reply and scope gates.
- One owner per concern: team layer (roles, Orca, gates, tiers, docs policy) is ours; domain checklists load via a role card or slot only when the work touches the domain.

## Principles

1. **Separate sessions:** the PO gives work to the Orchestrator (any coding agent in an Orca terminal), which dispatches everyone else; the PO discusses a product idea with the Researcher, whose note (`.team/research/`, `todo.md`) the Orchestrator reads, or technical design with the Solution Architect. No chat between a discussion session and the Orchestrator.
2. **Orca tracks, code is the truth:** no markdown boards; status, ownership, dependencies, gates live in Orca; how the system works is answered by code and tests; what the business wants, by the business spec.
3. **Process here, specifics in config:** no project stack, platform, command or branch name; agents and trackers are process.
4. **Evidence, not claims:** "done" means command output, a test run, a screenshot or a URL in `worker_done` or the delivery report.

## Product Owner

- **Product Owner:** owns priorities, scope, Gate 1 and Gate 2.

## Flow

```
Idea ─▶ Orchestrator (load config, size) ─▶ Tech Lead writes/updates business spec
                   │
             [GATE 1: PO approves business spec]
                   │   (same Tech Lead session continues)
        ┌──────────┴──────────┐
     Designer             Tech Lead
  (flow, 2-3 options)  (applies answers, ADR if needed, plan)
        │                     │
  [G-UI: PO picks one]        │
        └──────────┬──────────┘
                   │
        Build: one Builder, vertical slices in order
        (fast check per slice, full verify once)
                   │
        Verify: see `skills/orchestrator/references/review.md` "Verification and fix rounds"
                ║ QA ║ Perf/A11y*
                   │
        Fix loop (max 2 rounds, scoped re-review each) ── fail ─▶ escalate to PO
                   │
        Delivery Engineer (draft PR or committed branch)
                   │
             [GATE 2: PO reviews the delivery]
                   │
        Orchestrator closes Run
```
`*` only when triggered.

## Task DAG (Feature mode, S3)

```
spec ─▶ [gate-1] ─┬─▶ ux-flow ─▶ ux-options ─▶ [g-ui] ────────────┐
                  └─▶ plan (2-4 vertical slices) ─▶ arch-review* ─┴─▶ build (all slices)
                                                                     │
                                  verify ║ review-spec ║ qa ║ perf-a11y*
                                                                     │
                                     deliver (anti-ai on text) ─▶ [gate-2]
```
`spec` and `plan` are one Tech Lead dispatch; `gate-1` is its `ask`. `*` `arch-review` only when the plan touches a Solution Architect ADR (`roles/solution-architect.md` "Worker"); `perf-a11y` only when triggered.

## Other DAG shapes

- **Small change (S1):** `build -> verify (anti-ai, review) -> deliver -> [gate-2]`
- **Business rule change (S2):** `spec -> [gate-1] -> qa-tests -> build -> verify -> deliver -> [gate-2]`
- **New screen or flow (S2):** `ux-flow -> ux-options -> [g-ui] -> build -> (verify || qa || perf-a11y*) -> deliver -> [gate-2]`
- **PoC (S1):** from a `## PoC request` the PO names: `poc` Builder Task on branch `poc/<topic>` in its own worktree, never merged; posts the result (pass/fail per criterion, numbers, `path:line`) as a comment on the Solution Architect PR (`gh pr comment`); the PO names that PR to the Orchestrator.
- Ticket shapes: `skills/orchestrator/references/tickets.md`.
- One Build Task per feature; parallel Build Tasks only for disjoint slices when `flow.max_concurrent_agents` > 1.
- Overlap head and tail: the Designer runs beside the Tech Lead's plan after Gate 1; the Delivery body (no commits) runs beside the last scoped re-review.
