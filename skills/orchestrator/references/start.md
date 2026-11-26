# Start and coordinate

## Preflight

1. Identify repo, objective, source branch and any named Task or handoff. Read the request, `todo.md` and named carry-over or research notes. Ask only for unresolved identity or scope; preserve user work.
2. New objective: `team init <feature> --objective <text>` from this session (`--here` keeps the current checkout). Continuing work: read `.team/<feature>/handoff.md`, then `team status <feature>`. Check the result against "Run selection", "Shared feature workspace" and "Coordinator delivery". Call `team` literally (`team ...` or its path): the dashboard links this session to the Run from that command line.
3. Run install and verify commands, honoring `serial`; record baseline failures apart from regressions. With `codegraph: on`, initialize a missing worktree index (`skills/init-team/references/config-schema.md` "Code search setup"); read-only Support Engineers without a worktree use the main index.

## Run selection

- Each objective has one Run, created by `team init` before planning or the first gate or Task. This holds after `/clear`, in a reused session or worktree, and for mechanical edits, UI rounds and read-only investigations. Failed or uncertain creation follows Orca recovery.
- Continuing work: match handoff and live Orca state by repo, objective and Task ownership, and reuse their IDs; the session's current Run is no evidence. Ask only when ownership is ambiguous.
- Every Task of the objective belongs to that Run: planning, fixes, delivery, child-worktree and remote workers. `team` passes `--run`; pass it yourself on direct Orca commands. Process a wake from an older Run under that Run's IDs.

## Shared feature workspace

- Orchestrator, Builder and Reviewer share the feature's worktree and branch from planning through delivery, each in its own session. `team init` reuses the matching branch or creates it from the configured or PO-named base, and gives the feature its own worktree when another objective or pending gate occupies the checkout.
- Coordinating from that worktree takes a handoff and a new session there (load `orca-cli`); a shell `cd` leaves the Orca session where it was.
- On resume, compare workspace, checkout and branch with `run.json` before the next dispatch.
- Build and review alternate: commit before review and hold the reviewed revision until the verdict. Child worktrees: `plan.md` "Parallel Builders".

## Coordinator delivery

- `team init` records this session's terminal handle and Orca session (`team whoami`, from runtime metadata). Revalidate after replacement, relocation or a missing-sender error; workspace, title or mailbox prove nothing.
- Speak only as this session: its own `ORCA_TERMINAL_HANDLE`, its own session as `--from`. Without a supported identity or wake route, hold dispatch, tell the PO and transfer coordination per the Orca guide; PO pings and polling deliver nothing.
- Results arrive as the worker's `team submit` (a `worker_done`) on a supervised Dispatch. A launch receipt or stored mail proves neither wake nor processing.
- On resume or a missed completion, run `team status` and read inbox history with non-consuming reads; `handled: true` proves no processing. Repair the binding before the next dispatch.

## Handoff

- `.team/<feature>/handoff.md` (skeleton from `team init`) holds repo, workspace and branch, objective, coordinator identity, Run/Task/Dispatch IDs, stage, decisions, processed reports, open questions, next action and skills to load. Link specs, tickets and commits; Orca holds live state. Keep it under 40 lines (`team status` warns).
- Round commands append `Processed` lines and `team retry` appends `Retry` lines. Record a report no round command takes (Support Engineer, delivery, retro) yourself: `- Processed: Task | Dispatch | report path | verdict | revision | next action`.
- Refresh it on context or ownership change or PO request, and give the receiving session its path. Gate approval alone needs no new session.

## Board mapping

- The dashboard groups by repo, then Run (labelled by objective); worktree only for activity without a Run. Shared worktree or branch alone assigns no activity to a Run.
- `team` sets the board on the feature workspace: `in-progress` (`init`), `in-review` (`accept`), `completed` (`close`). No-code production investigations use the `branches.client_visible` remote ref.

## Worker permissions

- Give absolute skill paths and explicit action boundaries. Let workers attempt authorized work, commits included; handle the failures a session actually shows.
- On a failure, report the exact worker, command and error. Simplify the command within authorization or use environment approval or an authorized worker; keep denials and global permissions as they are.
- Git write denied: keep changed paths, verify evidence and commit text for an authorized committer. A committer change alone needs no rerun.
- `.team` link or write denied: report the resolved destination and request narrow environment permission. CLI, auth and model failures: `routing.md` rule 5.
