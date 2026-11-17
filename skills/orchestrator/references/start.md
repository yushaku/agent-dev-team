# Start and coordinate

## Preflight

1. Identify the repo and read `.team/config.yaml` (`config.md` defaults when absent). Identify the requested objective and any named Task or handoff; select its Run below. Ask only when the repo, scope or source branch remains ambiguous. Preserve uncommitted user work.
2. Read the relevant request/ticket, `todo.md`, carry-over and research notes it names. Choose the team below; resolve only its role skills and project slots. Report missing required skills once.
3. Select agents via `coding-agents.md`; complete Run selection below before creating Tasks or dispatching workers.
4. For code changes, use a feature worktree from the configured base or PO-named branch. Link `.team` and each `worktree_links` path to its main-checkout counterpart (one shared `.team/` per repo); follow install/verify commands and `serial`. Keep baseline failures distinct from regressions.

## Run selection

- New independent objective: automatically create a new Run before its first Task, even in a reused terminal or after `/clear` and `/orchestrator`. Name the Run for the PO's objective, not the first worker's assignment. Builder, review, fix and delivery Tasks for that objective share the Run.
- Continuing an existing objective: find its Run in the matching handoff and verify the repo, objective and Task ownership against live Orca state. Reuse that Run and existing Task identities; address follow-ups to their Dispatches and follow the recovery guide for retries. If the handoff is absent, discover the matching Run through Orca; ask only when ownership is ambiguous. The terminal's current Run alone is not a match.
- On Run creation or selection, save its ID in `.team/<feature>/handoff.md` before dispatch (`../SKILL.md`); give independent objectives separate feature directories and preserve older handoffs. Refresh Task/Dispatch references after dispatch so another session can resume.
- Pass the selected Run ID explicitly on Run-scoped commands using the version-matched guide. Before dispatch or follow-up, verify the Task/Dispatch belongs to that Run; check the receipt against it. Handle wakes from older Runs under their owning IDs, without changing the new objective's Run.

## Team decisions

- Default: one Builder handles diagnosis through delivery, including tests, measurements and docs; one independent Reviewer checks the result.
- Add a worker only for a named question/evidence gap the existing team cannot cover. Keep risk-triggered checks; separate workers are optional. Roster selection needs no PO gate.
- New or changed business rules need a spec and Gate 1. The Builder can author it; add a Tech Lead for unresolved requirements or design. New screens follow G-UI and `ui_rules`; delivery and tickets keep their gates (`gates.md`).
- Architecture impact without an accepted ADR (external vendor/system, data store, deployment topology, load target or personal-data boundary): ask the PO for a Solution Architect session before planning.
- Read-only questions may use one Investigator without a worktree. Respect `flow.max_concurrent_agents`; parallel work needs disjoint ownership or isolated workspaces and an integration owner.
- PO roster overrides apply. Ignore legacy `flow.default_size` and `flow.max_size`.

## Dispatch and follow-ups

- Use `specs.md` for Task input/metadata and `orchestration` for dispatch/wake handling. With `serial: true`, only one worker runs verify at a time.
- Send follow-ups to the existing Dispatch; preserve round metadata and use the receipt's Task identity. Keep worker sessions open until the Run ends for reuse.
- At handoff, or when HEAD changes unexpectedly, compare the reviewed revision with the current branch. Preserve PO edits; redirect affected workers to the new revision and review only what changed.
- Missing report: ask the same worker first; recovery is in `coding-agents.md` "Transcripts". A commit hash alone is insufficient.
- Before retry, stop, release or reassignment, load the version-matched recovery/cleanup guide; preserve Task identity and retry limits.
- Permission failures: `coding-agents.md` "Permission prompts".
- Use the worker's Dispatch identity for steering and stopping, following the version-matched guide. After `worker_done`, check `git status --short` in its worktree and reconcile changed paths with its report; report uncommitted delivery work and have an authorized committer finish it before calling delivery complete.
- On pause, stop workers still under Orchestrator control through the guide, preserve uncommitted work and write the handoff (`../SKILL.md`). Resume from the existing Task and Dispatch state using the recovery guide; carry forward completed work and retry history.
- When the PO takes over a worker, give its Task id, Dispatch id, terminal, spec path and dev URL when applicable; record the transfer in the handoff. Leave that worker under PO control until the PO returns it.

## Board mapping

- One feature worktree; Run selection follows the rules above. Link the ticket/PR to the workspace.
- Started = `in-progress`; delivered with Gate 2 pending = `in-review`; merged = `completed`.
- No-code production investigations read the configured `branches.client_visible` remote ref, not an unrelated working tree.

Evaluate the default over the next three delivered changes using existing reports: Task count, elapsed time, PO interventions and post-delivery defects. Fewer Tasks alone is not success.
