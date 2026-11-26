# Start and coordinate

## Preflight

1. Identify repo, objective, source branch and any named Task/handoff. Read the project config, request, `todo.md` and named carry-over/research notes. Ask only for unresolved identity or scope; preserve user work.
2. Run `team init <feature> --objective <text>` from this session (`--here` keeps the current checkout). It creates the worktree and branch, links `.team` and `worktree_links`, creates and binds the Run, and writes `run.json` and a handoff skeleton with this session's Orca identity. Check what it recorded against "Shared feature workspace", "Coordinator delivery" and "Run selection" before planning, gates or worker Tasks. Call `team` as `team ...` or by path, never through a shell variable: the dashboard links this session to the Run from that command line.
3. Follow install/verify commands and `serial`; separate baseline failures from regressions. With `codegraph: on`, initialize a missing worktree index before dispatch (`skills/init-team/references/config-schema.md` "Code search setup"). Read-only Support Engineers without a worktree use the main index.
4. Plan and choose the team. Resolve models/slots through `routing.md`, and Task inputs through `specs.md`.

## Shared feature workspace

- Orchestrator, default Builder and independent Reviewer use separate sessions in the same Orca worktree and feature branch through planning, build, review and delivery. Reuse the matching branch, or create the configured feature branch from the configured/PO-named base before grill writes repo docs.
- If another objective or pending gate occupies the checkout, `team init` gives the feature its own worktree. This session can coordinate from where it is; moving coordination there needs a handoff and a new session (load `orca-cli`). Changing shell cwd alone does not relocate an Orca session.
- Verify workspace, checkout and branch before Run creation or dispatch and on resume. Record them in the handoff; use them for placement and check receipts against them. Use `--worktree current` only from that verified workspace.
- Alternate build/fix and review. Commit writes before review and hold the reviewed revision stable until the verdict. Child-worktree exceptions are under "Team decisions"; the coordinator and integration Reviewer remain in the feature workspace.

## Run selection

- New independent objective on `/orchestrator`, including after `/clear` or in a reused session/worktree: create and bind one Orca Run with `team init`, named for the objective, before planning or the first gate/Task; it saves the Run ID in `run.json` and the handoff. Mechanical edits, UI rounds and read-only investigations follow this rule too. Failed or uncertain creation follows Orca recovery before Run-scoped work continues.
- Continuing work: match handoff and live Orca state by repo, objective and Task ownership; reuse Run/Task identities. Without a handoff, discover through Orca; ask only when ownership is ambiguous. The session's current Run alone is insufficient.
- Planning, Builder, Reviewer, specialists, fixes, re-reviews and delivery belong to that Run, including child-worktree and remote workers. Each ticket or review may have its own Task/Dispatch ID; carry the same Run ID in every Task spec.
- `team` passes `--run` on every Run-scoped command; pass it yourself on direct Orca commands that accept it. For Dispatch-addressed follow-ups, use the Dispatch belonging to that Run. Verify Task/Dispatch ownership in receipts and refresh handoff references before further dispatch; reconcile mismatches through Orca recovery. Process older-Run wakes under their owning IDs.

## Coordinator delivery

- `team whoami` reads this session's terminal handle and Orca session from runtime metadata and `agent list`; `team init` records it in the handoff. Workspace, title or mailbox existence alone does not prove identity or wake support.
- Bind from the coordinator's own runtime environment; a chat ID passed as `--from` from another session is refused. Record receiver identity/surface in the handoff and inspect delivery warnings. Revalidate after replacement, relocation or a missing-sender error.
- Never proxy a chat through a shell pane or another pane's `ORCA_TERMINAL_HANDLE`. Without a supported identity/wake route, hold dispatch, report the missing capability and transfer coordination through the Orca guide. PO pings, polling and background mailbox consumers are not delivery mechanisms.
- Use supervised `worker-start` when a result must return. Completion follows the Dispatch's `worker_done` route after the report is written; shell-addressed `status` mail is insufficient. Accepted launch/stored mail does not prove wake or processing.
- On resume or missed completion, reconcile Task/worker state and coordinator inbox history with non-consuming reads. Match Task/Dispatch IDs, read reports not yet processed and record them in the handoff; `handled: true` alone does not prove report processing. Repair binding before new dispatch; preserve settled work.

## Plan

- Plan new/changed behavior with the PO in this session: `grill-with-docs` → `to-spec` → `to-tickets`. A fully specified mechanical edit skips grill and gets one ticket.
- Load each planning skill by absolute `$AGENT_SKILLS_DIR/<name>/SKILL.md` path (`disable-model-invocation`). `grill-with-docs` loads `grilling` and `domain-modeling`; pass config `matt.glossary`, `matt.adr`, `matt.tracker`. Skip `setup-matt-pocock-skills`; real trackers remain unwritten.
- Obtain repo facts from a read-only fresh-context subagent or Support Engineer Task without a worktree. Use its summary. Commit grill's glossary/ADRs as one `docs` commit in the feature worktree.
- Ask per `gates.md` "Asking in rounds"; record numbered PO decisions in `decisions.md`. Personal-data capabilities also use `skills/team-builder/references/data.md` "Personal data".
- UI tickets record recommended choices for reference/pattern, action placement, empty/error/loading states and mobile placement (pinned bottom, inline or sheet).
- `to-spec` writes `.team/<feature>/spec.md` with test seams. `to-tickets` writes `NN-<slug>.md` in `matt.tracker`, blockers first, with `Blocked by:` and no `Status:`. Gate 1 follows `gates.md`.
- After tickets, compact or write the handoff before build dispatch. Create one Task per ticket and a dependency per blocking edge; Orca owns status.

## Team decisions

- Default: one Builder owns implementation, tests, measurements, docs and delivery evidence; one independent Reviewer checks it. Agent separation and tiers follow `routing.md`.
- Add specialists only for a named decision/evidence gap. Preserve risk-triggered checks; roster selection needs no gate. Respect `flow.max_concurrent_agents` and PO overrides; ignore legacy `flow.default_size`/`max_size`.
- Architecture impact without an accepted ADR (vendor/system, store, deployment, load target or personal-data boundary): ask for a Solution Architect session before planning.
- **UI prototype:** use a Builder with `prototype` on unmerged `prototype/<name>` only when the PO needs a visual choice, or for a wholly new screen with `ui_rules.gate: on`. Pass `ui_rules` and `design` skills; show in `DEV`, then G-UI. Otherwise use the ticket's grill answers.
- **Parallel Builders:** require at least three tickets, two ready independent tickets, available agent capacity and `serial: false`. Give each a child worktree of the feature branch with Preflight setup and a named ticket. Start dependents after blockers merge. The first Builder integrates child branches in ticket order, reruns feature verify and prepares delivery (`delivery.md`); one Reviewer checks the integrated branch.
- **Architecture scan:** periodically or on PO request, assign `improve-codebase-architecture` by absolute path to a read-only Reviewer-tier Task. Send its HTML report to the PO to select follow-up.
- Read-only questions may use one Support Engineer without a worktree. Parallel work requires disjoint ownership or isolation and an integration owner.

## Dispatch and follow-ups

- Use `specs.md` for inputs and peer communication. Keep the same workers/Reviewer through fixes and delivery; start fix rounds with `team fix` / `team rereview` (`review.md`) and other follow-up Tasks with `team start ... --reuse <role>` (`specs.md` "Task specs"). Keep sessions open until Run end. Replace only for Orca refusal or changed capability/tier, with handoff first; recheck eligibility through `routing.md`.
- Preserve Task/round metadata and verify receipt identity. With `serial: true`, run one worker's verify at a time.
- Unexpected HEAD change or handoff: compare reviewed and current revisions, preserve PO edits, redirect workers and review the delta.
- Missing report: ask the same worker; if unavailable, read its latest output with `team read <role|task>`. A commit hash alone is insufficient.
- Before retry, stop, release or reassignment, load Orca's recovery/cleanup reference. Silence, timeout or uncertain liveness does not prove failure. Steer/stop by Dispatch identity; preserve retry limits.
- On PO pause, stop workers still under coordinator control through the guide, preserve changes and write the handoff. Resume with existing identities/history.
- On PO takeover, provide Task/Dispatch IDs, session/terminal, spec and dev URL; record transfer and leave that worker under PO control until returned.

## Handoff

- Keep `.team/<feature>/handoff.md` under 40 lines: repo/workspace/branch, objective, coordinator receiver/surface, Run/Task/Dispatch IDs, routing log, stage, decisions, processed reports, open questions, next action and skills to load. Link specs, tickets and commits; Orca owns live state.
- Use separate feature directories and preserve older handoffs. Refresh on context/ownership change or PO request; give the receiving session the path. Gate approval alone needs no new session.

## Board mapping

- Dashboard work groups use repo then Orca Run ID, labelled by objective; use worktree only for activity without a Run ID. One Run spans coordinator/worker worktrees, while different Runs stay separate even in the same worktree. Worktree or branch equality alone does not assign activity to a Run.
- Place Run card, status and ticket/PR links in the shared feature workspace: started `in-progress` (`team init`), delivered/Gate 2 pending `in-review` (`team board in-review`), merged `completed` (`team close`).
- No-code production investigations use the configured `branches.client_visible` remote ref.

## Worker permissions

- Give absolute skill paths and explicit action boundaries. Attempt authorized work; handle observed session-specific failures rather than forbidding commits preemptively.
- Report the exact worker, command and error. Simplify commands within authorization; use environment approval or an authorized worker, preserving denials and global permissions.
- Git write denied: retain changed paths, verify evidence and commit text for an authorized committer. A committer change alone needs no rerun.
- `.team` link/write denied: report the resolved destination and request narrow environment permission. CLI/auth/model failures follow `routing.md` and Orca recovery.
