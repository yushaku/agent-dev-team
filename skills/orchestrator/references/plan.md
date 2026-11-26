# Plan and team

## Plan

1. Plan with the PO in this session: `grill-with-docs` → `to-spec` → `to-tickets`. Load each by absolute `$AGENT_SKILLS_DIR/<name>/SKILL.md` path (`disable-model-invocation`). `grill-with-docs` loads `grilling` and `domain-modeling`; pass config `matt.glossary`, `matt.adr`, `matt.tracker`. Skip `setup-matt-pocock-skills`; real trackers stay unwritten.
2. Get repo facts from a read-only fresh-context subagent or a Support Engineer Task without a worktree, and plan from its summary.
3. Ask per `gates.md` "Asking in rounds"; record numbered PO decisions in `decisions.md`. Personal-data capabilities also use `skills/team-builder/references/data.md` "Personal data". UI tickets record the recommended reference or pattern, action placement, empty/error/loading states and mobile placement (pinned bottom, inline or sheet).
4. Commit grill's glossary and ADRs as one `docs` commit in the feature worktree. `to-spec` writes `.team/<feature>/spec.md` with test seams; `to-tickets` writes `NN-<slug>.md` in `matt.tracker`, blockers first, with `Blocked by:` and no `Status:`.
5. Gate 1 per `gates.md`. Then compact or write the handoff, create one Task per ticket and a dependency per blocking edge; Orca owns status.

## Team decisions

- Default team: one Builder owns implementation, tests, measurements, docs and delivery evidence; one independent Reviewer checks it. Agents and tiers: `routing.md`.
- Add a specialist only for a named decision or evidence gap; keep risk-triggered checks. Roster choice needs no gate. Respect `flow.max_concurrent_agents` and PO overrides.
- Architecture impact without an accepted ADR (vendor or system, store, deployment, load target, personal-data boundary): ask for a Solution Architect session before planning.
- **UI prototype:** a Builder with `prototype` on unmerged `prototype/<name>`, only when the PO needs a visual choice or for a wholly new screen with `ui_rules.gate: on`. Pass `ui_rules` and the `design` slot; show it in `DEV`, then G-UI. Otherwise build from the ticket's grill answers.
- **Architecture scan:** periodically or on PO request, a read-only Reviewer-tier Task with `improve-codebase-architecture` by absolute path. The PO picks follow-ups from its HTML report.
- Read-only questions may use one Support Engineer without a worktree. Parallel work needs disjoint ownership or isolation and one integration owner.

## Parallel Builders

- Only with three or more tickets, two of them ready and independent, free agent capacity and `serial: false`.
- Each Builder gets a child worktree of the feature branch with Preflight setup and a named ticket. Dependents start after their blockers merge.
- The first Builder integrates child branches in ticket order, reruns `team verify` and prepares delivery (`delivery.md` "Merge and cleanup"); one Reviewer checks the integrated branch.
