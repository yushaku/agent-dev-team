# Workflow

- Scope: any software project (web, mobile, desktop, backend, CLI).
- Per-project specifics (stack, platform skills, commands, tracker, branches, delivery) load at run time from the project config (`config.md`).
- Output ends at a delivered change: a draft PR or a committed branch. Humans merge, release and deploy outside this process.

## Locations

- Team root `$AGENT_TEAM_HOME`: the folder holding `workflow.md` (default `~/.agents/teams`). Paths in these docs are relative to it.
- Shared skills dir `$AGENT_SKILLS_DIR` (default `~/.agents/skills`).
- Scratch dir `$AGENT_TEAM_SCRATCH` (default: the system temp dir): tmux sessions and quota probes (`coding-agents.md`).

## Goals

- Idea to reviewed, tested change, with a human Product Owner (PO) approving only at fixed gates: Gate 1 (business spec), G-UI (new screens, when the project turns it on), Gate 2 (delivery); maintenance adds its reply and scope gates.
- Reuse shared skills in `~/.agents/skills` and the project's own skills; these docs only assign them to roles.
- One owner per concern: team layer (roles, Orca, gates, tiers, docs policy) is ours; worker process uses `tdd`, `diagnosing-bugs`, `codebase-design`; lean code and Standards review use `ponytail` / `ponytail-review`; domain checklists load via a role card or slot only when the work touches the domain.

## Principles

1. **Separate sessions:** the PO gives work to the Orchestrator (any coding agent in an Orca terminal), which dispatches everyone else; the PO discusses a product idea with the Researcher, whose note (`.team/research/`, `todo.md`) the Orchestrator reads, or technical design with the Solution Architect. No chat between a discussion session and the Orchestrator.
2. **Orca tracks, code is the truth:** no markdown boards; status, ownership, dependencies, gates live in Orca; how the system works is answered by code and tests; what the business wants, by the business spec.
3. **Process here, specifics in config:** no project stack, platform, command or branch name; agents and trackers are process.
4. **Few documents, one owner each:** `docs-policy.md`.
5. **Say it once:** `docs-policy.md` "Writing".
6. **Smallest thing that works:** for code and docs; reviewers flag unnecessary docs like unnecessary code.
7. **Evidence, not claims:** "done" means command output, a test run, a screenshot or a URL in `worker_done` or the delivery report.
8. **Bounded:** "Escalation" below; concurrent agents capped by project config (`flow.max_concurrent_agents`).

## Product Owner

- **Product Owner:** owns priorities, scope, Gate 1 and Gate 2.

## Flow

```
Idea ─▶ Orchestrator (load config, size) ─▶ PM writes/updates business spec
                   │
             [GATE 1: PO approves business spec]
                   │
        ┌──────────┴──────────┐
     Designer             Tech Lead
  (flow, 2-3 options)  (ADR if needed, plan)
        │                     │
  [G-UI: PO picks one]        │
        └──────────┬──────────┘
                   │
        Build: one Builder, vertical slices in order
        (fast check per slice, full verify once)
                   │
        Verify: see `orchestrator/review.md` "Verification and fix rounds"
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
pm-spec ─▶ [gate-1] ─┬─▶ ux-flow ─▶ ux-options ─▶ [g-ui] ────────────┐
                     └─▶ plan (2-4 vertical slices) ─▶ arch-review* ─┴─▶ build (all slices)
                                                                     │
                                  verify ║ review-spec ║ qa ║ perf-a11y*
                                                                     │
                                     deliver (anti-ai on text) ─▶ [gate-2]
```
`*` `arch-review` only when the plan touches a Solution Architect ADR (`roles/solution-architect.md` "Worker"); `perf-a11y` only when triggered.

- Architecture impact (`sizing.md`): after Gate 1 the Orchestrator pauses before `plan` until the ADR is accepted.

## Other DAG shapes

- **Small change (S1):** `build -> verify (anti-ai, review) -> deliver -> [gate-2]`
- **Business rule change (S2):** `pm-spec -> [gate-1] -> qa-tests -> build -> verify -> deliver -> [gate-2]`
- **New screen or flow (S2):** `ux-flow -> ux-options -> [g-ui] -> build -> (verify || qa || perf-a11y*) -> deliver -> [gate-2]`
- **PoC (S1):** from a `## PoC request` the PO names: `poc` Builder Task on branch `poc/<topic>` in its own worktree, never merged; writes the result (pass/fail per criterion, numbers, `path:line`) to `.team/architecture/<topic>-poc.md`; the PO brings it back to the Solution Architect session.
- Maintenance shapes: `maintenance.md`.
- One Build Task per feature; parallel Build Tasks only for disjoint slices when `flow.max_concurrent_agents` > 1.
- `verify` and `review-spec`: `orchestrator/review.md` "Verification and fix rounds".
- Keep verification waves parallel; no dependency chain deeper than 3 or 4 Tasks.
- Overlap head and tail: PM tidy (`roles/pm.md`) starts beside Designer and Tech Lead after Gate 1; the Delivery body (no commits) runs beside the last scoped re-review.

## Definition of Done (feature)

- Every acceptance criterion in the business spec maps to a passing test.
- Zero Must fix findings; triggered audits: zero high-severity findings.
- No AI tells left in code, comments, docs, commits or delivery text.
- `commands.verify` green.
- A feature calling an external service (push, mail, payments): one real end-to-end call on a production preview, its evidence in the delivery; mocked tests do not count.
- UI changes: screenshots in the delivery only when the visual loop ran; otherwise "UI check: PO" under Human steps.
- Delivered per `delivery.mode` with the body in `roles/delivery.md`.
- CHANGELOG line in the change; human docs regenerated if a source changed; scratch deleted at close.
- PO approved the delivery at Gate 2.

## Escalation

Ping the PO immediately when:
- A task fails its fix loop twice.
- Two roles disagree and no ADR settles it.
- Code and business spec disagree (`docs-policy.md`).
- Scope must change versus the approved spec.
- A security finding is high severity.
- A personal data breach is suspected, in any flow: report at once with what is known; the legal deadline is the PO's (GDPR: 72 hours to the authority).
- A worker is blocked for more than a few minutes (`roles/orchestrator.md` "Every turn").
- Any action is irreversible: force-pushing shared branches, migrations against real data, deleting branches or data, spending money.
