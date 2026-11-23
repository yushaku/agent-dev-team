# Start and coordinate

## Preflight

1. Identify the repo and read `.team/config.yaml` (`skills/init-team/references/config-schema.md` only for a missing or unknown key; missing config/catalog: `skills/init-team/SKILL.md`). Identify the requested objective and any named Task or handoff; select its Run below. Ask only when the repo, scope or source branch remains ambiguous. Preserve uncommitted user work.
2. Read the relevant request/ticket, `todo.md`, carry-over and research notes it names. Plan below, then choose the team; resolve only its role skills (`team-<role>`) and project slots, and each Task's `Refs:` (`specs.md`). Report missing required skills once.
3. Select agents/models from project `models` via `skills/orchestrator/references/routing.md` "Model routing"; complete Run selection below before creating Tasks or dispatching workers.
4. For code changes, use a feature worktree from the configured base or PO-named branch. Link `.team` and each `worktree_links` path to its main-checkout counterpart (one shared `.team/` per repo); follow install/verify commands and `serial`. Keep baseline failures distinct from regressions.
5. With `codegraph: on` (`skills/init-team/references/config-schema.md` "Code search setup"), check the worktree has `.codegraph/`; if missing, run `codegraph init .` in it before dispatch. Read-only Support Engineers without a worktree use the main checkout's index.

## Run selection

- New independent objective: automatically create a new Run before its first Task, even in a reused terminal or after `/clear` and `/orchestrator`. Name the Run for the PO's objective, not the first worker's assignment. Build, review and fix Tasks for that objective share the Run.
- Continuing an existing objective: find its Run in the matching handoff and verify the repo, objective and Task ownership against live Orca state. Reuse that Run and existing Task identities; address follow-ups to their Dispatches and follow the recovery guide for retries. If the handoff is absent, discover the matching Run through Orca; ask only when ownership is ambiguous. The terminal's current Run alone is not a match.
- On Run creation or selection, save its ID in `.team/<feature>/handoff.md` before dispatch (`../SKILL.md`); give independent objectives separate feature directories and preserve older handoffs. Refresh Task/Dispatch references after dispatch so another session can resume.
- Pass the selected Run ID explicitly on Run-scoped commands using the version-matched guide. Before dispatch or follow-up, verify the Task/Dispatch belongs to that Run; check the receipt against it. Handle wakes from older Runs under their owning IDs, without changing the new objective's Run.

## Plan

New or changed behavior is planned in this session with the PO, in one unbroken window: `grill-with-docs`, then `to-spec`, then `to-tickets`. A mechanical edit the PO fully specified skips grill and gets one ticket.

- Load each by absolute path (`$AGENT_SKILLS_DIR/<name>/SKILL.md`); they have `disable-model-invocation`. `grill-with-docs` loads `grilling` and `domain-modeling`.
- No `setup-matt-pocock-skills`. Give the skills `matt.glossary`, `matt.adr` and `matt.tracker` from config; real trackers are never written. `domain-modeling` writes `GLOSSARY.md` and ADRs in the feature worktree; commit them as one `docs` commit.
- Repo facts: a read-only fresh-context subagent (a Support Engineer Task without a worktree, or the agent's own sub-agent) answers them; use its summary. Never read code yourself.
- Grill asks per `gates.md` "Asking in rounds"; each PO decision goes to `.team/<feature>/decisions.md`. A capability touching personal data also asks `skills/team-builder/references/data.md` "Personal data".
- A ticket that changes user-visible UI also asks, each with a recommended answer: pattern or reference app; where actions live (visible, long-press, menu); empty, error and loading states; mobile placement (pinned bottom, inline, sheet). The answers go into the ticket.
- `to-spec` writes `.team/<feature>/spec.md` and proposes the test seams. `to-tickets` writes `matt.tracker` as `NN-<slug>.md`, blockers first, each with a `Blocked by:` line and no `Status:` line.
- Gate 1 has two steps (`gates.md`): spec and seams, then slices and blocking edges.
- After `to-tickets`, compact or write `handoff.md` before dispatching build.
- Create one Orca Task per ticket; each blocking edge becomes a Task dependency. Orca holds all status. Prototype Tasks: "Team decisions".

## Team decisions

- Default: one Builder works the tickets (tests, implementation, measurements, docs, delivery evidence). One independent Reviewer, on a different Orca agent than the Builder, checks the result.
- Add a worker only for a named question/evidence gap the existing team cannot cover. Keep risk-triggered checks; separate workers are optional. Roster selection needs no PO gate.
- New or changed behavior needs Plan and Gate 1. Delivery and production tickets keep their gates (`gates.md`).
- Architecture impact without an accepted ADR (external vendor/system, data store, deployment topology, load target or personal-data boundary): ask the PO for a Solution Architect session before planning.
- **UI prototype:** only when the PO says they must see it to choose, or the ticket is a wholly new screen (`ui_rules.gate: on`): a Builder Task using `prototype` on branch `prototype/<name>` (never merged), shown in the `DEV` pane, then G-UI (`gates.md`). Put `ui_rules` and the `design` slot skills in the Task Constraints. Otherwise the ticket's grill answers are the design.
- **Parallel Builders:** the frontier is the tickets whose blockers are done. When it has two or more tickets and `flow.max_concurrent_agents` allows, dispatch one Builder per ready ticket, each in a child worktree of the feature branch (preflight steps 4 and 5 apply), naming its ticket in the Task. A ticket starts once its blockers are merged. The first-dispatched Builder is the integration owner: it integrates finished child branches in ticket order (`delivery.md`), reruns `commands.verify` on the feature branch and prepares delivery evidence. One Reviewer reviews the integrated feature branch. Keep one Builder when every ticket depends on another, there are fewer than three tickets, or `serial: true`.
- **Architecture scan:** `improve-codebase-architecture` (absolute path) runs periodically, or when the PO asks, as one read-only Reviewer-tier Task; its HTML report goes to the PO, who picks any follow-up.
- Read-only questions may use one Support Engineer without a worktree. Respect `flow.max_concurrent_agents`; parallel work needs disjoint ownership or isolated workspaces and an integration owner.
- PO roster overrides apply. Ignore legacy `flow.default_size` and `flow.max_size`.

## Dispatch and follow-ups

- Use `specs.md` for Task input/metadata and "Worker communication"; supply current peer addresses so Workers can exchange technical details directly. Use `orchestration` for dispatch/wake handling. With `serial: true`, only one worker runs verify at a time.
- Before a follow-up, reread project `models` and confirm the reused worker remains eligible; otherwise hand off through the recovery guide. Send follow-ups to the existing Dispatch; preserve round metadata and use the receipt's Task identity. Keep worker sessions open until the Run ends for reuse.
- At handoff, or when HEAD changes unexpectedly, compare the reviewed revision with the current branch. Preserve PO edits; redirect affected workers to the new revision and review only what changed.
- Missing report: ask the same worker first. If it cannot report, inspect the exact session from its receipt with the version-matched Orca guide; discover transcript location/format rather than guessing from the agent name. A commit hash alone is insufficient.
- Before retry, stop, release or reassignment, load the version-matched recovery/cleanup guide; preserve Task identity and retry limits.
- Permission failures: "Worker permissions" below.
- Use the worker's Dispatch identity for steering and stopping, following the version-matched guide. After `worker_done`, check `git status --short` in its worktree and reconcile changed paths with its report; report uncommitted delivery work and have an authorized committer finish it before calling delivery complete.
- On pause, stop workers still under Orchestrator control through the guide, preserve uncommitted work and write the handoff (`../SKILL.md`). Resume from the existing Task and Dispatch state using the recovery guide; carry forward completed work and retry history.
- When the PO takes over a worker, give its Task id, Dispatch id, terminal, spec path and dev URL when applicable; record the transfer in the handoff. Leave that worker under PO control until the PO returns it.

## Board mapping

- One feature worktree; Run selection follows the rules above. Link the ticket/PR to the workspace.
- Started = `in-progress`; delivered with Gate 2 pending = `in-review`; merged = `completed`.
- No-code production investigations read the configured `branches.client_visible` remote ref, not an unrelated working tree.

## Worker permissions

- Capabilities and permissions are session-specific. Attempt authorized work and recover from observed failures; give workers absolute skill paths and explicit action boundaries.
- Report the exact command, error and worker. Simplify a compound command only within the authorized action; use environment approval or an authorized worker rather than bypassing a denial or changing global permissions.
- Git write denied: preserve changed paths, verify evidence and commit text for an authorized committer. Keep user changes; a committer change alone does not require rerunning checks.
- `.team` link/write denied: report the resolved destination and requested access, then request narrow permission through the environment. Missing CLI/auth/model follows `skills/orchestrator/references/routing.md` "Model routing" and the Orca recovery guide.
