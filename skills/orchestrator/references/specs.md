# Task specs and dispatch

`team start <role>` writes the spec under `.team/<feature>/specs/`, creates the Task and dispatches the worker; `team spec` writes only the file, for edits before `team start <spec>`. `team help` lists the flags. A generated spec is the format reference, also for a hand-written one when `team` cannot place the worker; the dashboard reads its `Role`, `Measurement`, `Routing` and `Routing-log` lines.

## What you supply

`team` fills identity, workspace, peers, role skill, verify evidence, output path and the config-derived constraints. You supply the judgment:

- `--catalog` and `--selection`: tier and entry per `routing.md`, and why they fit.
- `--ticket <path>`, linked rather than restated; `--goal` and `--scope` for work without a ticket (investigation, delivery, retro).
- `--kind` build|review|fix|re-review|delivery|close|merge|other. Round commands set `--round` and fix `--cause` (defect|requirements|scope|standards, omitted if unknown).
- `--skill` for resolved slot skills (`routing.md` "Skill slots"), `disable-model-invocation` ones included. Workers pick their own role references.
- `--constraint` for project rules, protected user files, branch and delivery rules, and on UI tickets `ui_rules` and the `design` slot. An isolated Task names its child worktree and integration target.
- `--ref` for source decisions, approval boundaries and related docs. Changed decisions go through `gates.md`.

## Follow-ups

- Each unit of work (build, fix, re-review, retro, close) is its own Task. Rounds use the commands in `review.md`; any other follow-up goes to the same worker with `team start ... --reuse <role>` (workers run `--keep-open`).
- `send` steers a worker on its current Task only; sent to a settled Dispatch it becomes a follow-up Task without metadata.
- Keep workers and their sessions from build to Run end. Replace one only on Orca refusal or a changed capability or tier: handoff first, eligibility per `routing.md`.
- A worker that failed to run: `routing.md` rule 5. Silence, timeout or uncertain liveness is no failure; any other stop, release or reassignment loads Orca's recovery reference first.
- Missing report: ask the same worker, else `team read <role|task>`. A commit hash is no report.
- Unexpected HEAD change or handoff: compare reviewed and current revisions, keep PO edits, redirect workers and review the delta.
- PO pause: stop workers under coordinator control, keep changes, write the handoff, resume with the same identities. PO takeover: give Task and Dispatch IDs, terminal, spec and dev URL, and leave that worker to the PO until returned.

## Routing history

Orca specs are create-only: the `Routing:` line keeps the first selection and `routing.jsonl` gets one record per Dispatch from `team start`, `dispatch` and `retry`. Start every retry and replacement through `team` so the dashboard can bind model settings to each Dispatch window; records it cannot match stay unverified.

## UI and running app

- Include `ui_rules`, viewports and the ticket's UI answers or the chosen prototype variant. PO inputs go to `.team/<feature>/inputs/`. The visual loop runs only by config or PO request.
- Add the `orca-cli` skill path; the Builder's acceptance checks include `delivery.md` "Local test before Gate 2".
- App startup, migrations and seeds run in Run-owned Orca terminals via `orca-cli`, the server in the foreground of the reused `DEV` pane. Stream output to the pane and `.team/<feature>/logs/` with secrets redacted; report pane handle, cwd, commands and log paths.
- One isolated Orca browser profile per test account. Take the server URL from Orca ports after checking it responds.
- Screenshots go to `.team/<feature>/shots/` per viewport and color scheme. List `human_only` checks for the PO.

## Task files

Messages point to files. Run files live under `.team/<feature>/` through the worktree's `.team` link.

| Path | Writer | Content |
|---|---|---|
| `specs/NN-<role>[-rN].md` | `team` | Task input, one per Task |
| `reports/NN-<role>[-rN].md` | worker of Task NN | Task output (`reports.md`), prefilled by `team` |
| `logs/verify-<sha>.log` | `team verify` | `commands.verify` output and result per command for that revision (`-dirty` when uncommitted) |
| `logs/NN-<command>.log` | worker of Task NN | Other test and tool output (`WRANGLER_LOG_PATH` included) |
| `inputs/` | Orchestrator, from the PO | Reference docs, screenshots, sketches |
| `shots/` | Builder (visual loop) | Screenshots per viewport and color scheme |
| `decisions.md` | Orchestrator | Numbered PO decisions: Gate 1 answers, scope cuts, Orchestrator defaults |
| `spec.md`, `issues/NN-<slug>.md` | Orchestrator (`to-spec`, `to-tickets`) | Spec with test seams; one ticket per Task with `Blocked by:` |
| `handoff.md` | Orchestrator and `team` | `start.md` "Handoff" |
| `run.json`, `routing.jsonl` | `team` | Run, workspace, Tasks and Dispatches; routing per Dispatch |
