# Start and coordinate

## Preflight

1. Identify repo, objective, source branch and any named Task/handoff. Read the project config, request, `todo.md` and named carry-over/research notes. Ask only for unresolved identity or scope; preserve user work.
2. Run `team init <feature> --objective <text>` from this session (`--here` keeps the current checkout). It creates the worktree and branch, links `.team` and `worktree_links`, creates and binds the Run, and writes `run.json` and a handoff skeleton with this session's Orca identity. Check what it recorded against "Shared feature workspace", "Coordinator delivery" and "Run selection" before planning, gates or worker Tasks. Call `team` as `team ...` or by path, never through a shell variable: the dashboard links this session to the Run from that command line.
3. Follow install/verify commands and `serial`; separate baseline failures from regressions. With `codegraph: on`, initialize a missing worktree index before dispatch (`skills/init-team/references/config-schema.md` "Code search setup"). Read-only Support Engineers without a worktree use the main index.
4. Plan and choose the team. Resolve models/slots through `routing.md`, and Task inputs through `specs.md`.

## Shared feature workspace

- Orchestrator, default Builder and independent Reviewer share the feature's Orca worktree and branch from planning through delivery, in separate sessions. `team init` reuses the matching branch or creates it from the configured/PO-named base, and gives the feature its own worktree when another objective or pending gate occupies the checkout. Coordinating from there needs a handoff and a new session (load `orca-cli`); changing shell cwd does not relocate an Orca session.
- On resume, check workspace, checkout and branch against `run.json` before dispatch; use `--worktree current` only from that workspace.
- Alternate build/fix and review. Commit before review and hold the reviewed revision until the verdict. Child-worktree exceptions are under "Team decisions".

## Run selection

- A new objective on `/orchestrator` (also after `/clear` or in a reused session/worktree, and for mechanical edits, UI rounds and read-only investigations) gets its own Run from `team init` before planning or the first gate/Task. Failed or uncertain creation follows Orca recovery.
- Continuing work: match handoff and live Orca state by repo, objective and Task ownership and reuse their IDs; the session's current Run alone proves nothing. Ask only when ownership is ambiguous.
- Every Task of the objective (planning, roles, fixes, re-reviews, delivery, child-worktree and remote workers) belongs to that Run. `team` passes `--run`; pass it yourself on direct Orca commands, and address follow-ups to that Run's Dispatch. Process older-Run wakes under their own IDs.

## Coordinator delivery

- `team init` records this session's identity (`team whoami`: terminal handle and Orca session from runtime metadata). Workspace, title or mailbox alone do not prove identity. Revalidate after replacement, relocation or a missing-sender error.
- Never proxy through another pane's `ORCA_TERMINAL_HANDLE` or pass another session's ID as `--from`. Without a supported identity/wake route, hold dispatch, report it and transfer coordination through the Orca guide; PO pings and polling are not delivery.
- Results return through supervised Dispatches (`team dispatch`) and the worker's `team submit`. An accepted launch or stored mail does not prove wake or processing.
- On resume or missed completion, run `team status`: it joins Orca Task state with report verdicts and warns about reports without a `Processed` line. Read inbox history with non-consuming reads; `handled: true` does not prove processing. Repair binding before new dispatch.

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

- Inputs and peer communication follow `specs.md`. Keep the same workers through fixes and delivery: `team fix` / `team rereview` / `team accept` (`review.md`), other follow-ups `team start ... --reuse <role>`. Keep sessions open until Run end; replace a worker only for Orca refusal or changed capability/tier, handoff first, eligibility per `routing.md`.
- A worker that failed to run (launch, auth, quota, crash): `team retry <task|role> --reason <error> [--catalog <alias>]`. Silence, timeout or uncertain liveness does not prove failure; other stop, release or reassignment loads Orca's recovery reference first.
- Unexpected HEAD change or handoff: compare reviewed and current revisions, preserve PO edits, redirect workers and review the delta.
- Missing report: ask the same worker, else read its output with `team read <role|task>`. A commit hash alone is insufficient.
- PO pause: stop workers under coordinator control, preserve changes, write the handoff, resume with the same identities. PO takeover: give Task/Dispatch IDs, terminal, spec and dev URL; leave that worker to the PO until returned.

## Handoff

- `team init` writes `.team/<feature>/handoff.md`; `team` appends `Processed` and `Retry` lines and `team status` warns past 40 lines. Keep it to repo/workspace/branch, objective, coordinator identity, Run/Task/Dispatch IDs, stage, decisions, processed reports, open questions, next action and skills to load; link specs, tickets and commits (Orca owns live state).
- Refresh on context/ownership change or PO request and give the receiving session the path. Gate approval alone needs no new session.

## Board mapping

- The dashboard groups by repo, then Run (labelled by objective); worktree only for activity without a Run. Worktree or branch equality alone does not assign activity to a Run.
- `team` sets the board on the feature workspace: `in-progress` (`init`), `in-review` (`accept`), `completed` (`close --merge`). No-code production investigations use the `branches.client_visible` remote ref.

## Worker permissions

- Give absolute skill paths and explicit action boundaries. Attempt authorized work; handle observed session-specific failures rather than forbidding commits preemptively.
- Report the exact worker, command and error. Simplify commands within authorization; use environment approval or an authorized worker, preserving denials and global permissions.
- Git write denied: retain changed paths, verify evidence and commit text for an authorized committer. A committer change alone needs no rerun.
- `.team` link/write denied: report the resolved destination and request narrow environment permission. CLI/auth/model failures follow `routing.md` and Orca recovery.
