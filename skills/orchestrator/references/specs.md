# Task specs

`team start <role> ...` writes the Task spec under `.team/<feature>/specs/`, creates the Task and dispatches the worker; `team spec` writes only the file, for edits before `team start <spec>`. `team help` lists the flags. A generated spec is the format reference, also for a hand-written one when `team` cannot place the worker.

`team` fills Role, Run, Measurement, Routing, Routing-log, Spec, Workspace, Peers, Skills (role skill first), Evidence (`commands.verify`, `serial`), Output, and Constraints from config: worker communication, browser, `matt.*`, `human_only`, codegraph. It refuses missing metadata, `FILL:` lines, a fix/re-review without a positive round, an alias outside its tier, and a Reviewer on a Builder's agent. The dashboard reads `Role`, `Measurement`, `Routing` and `Routing-log` from the Orca Task spec.

You supply the judgment:

- `--catalog` and `--selection`: tier and entry per `routing.md`, and why they fit.
- `--ticket <path>`, linked without restating it; or `--goal` and `--scope` for reviews, delivery, close and investigations.
- Measurement: `--kind` build|review|fix|re-review|delivery|close|merge|other. Fix/re-review Tasks in one cycle share a positive `--round`; fix `--cause` is defect|requirements|scope|standards, or omitted if unknown. Preserve metadata on retries.
- `--skill` for resolved slot skills (`routing.md` "Skill slots"), `disable-model-invocation` ones included. Workers select their role references themselves.
- `--constraint` for project rules, protected user files, branch/delivery rules and, on UI tickets, `ui_rules` and the `design` slot. Isolated Tasks name their child worktree and integration target; workers need coordinator approval to change checkout/branch or create another worktree.
- `--ref` for Task-specific references: source decisions and approval boundaries, related docs. Routine scoped reads, edits, tests and authorized delivery proceed; changed decisions use `gates.md`, permission failures use `start.md` "Worker permissions".

Every new unit of work (build, fix, re-review, retro, close) is its own Task. Fix rounds: `team fix` / `team rereview` (`review.md`). Otherwise continue on the same worker with `--reuse <role>`: workers start `--keep-open`, so their terminal stays reusable. `send` to a settled Dispatch becomes a follow-up Task without this metadata; use `send` only to steer a worker on its current Task.

## Routing history

Orca Task specs are create-only, so the Routing line holds the first selection and `routing.jsonl` holds every Dispatch: `team dispatch` and `team start` append one record per Dispatch id. Start retries and replacements through `team` as well, before follow-up work, and keep the log path in the handoff. The dashboard binds settings to the exact Dispatch window from matching records in `.team/`; missing or ambiguous records stay unverified.

## Worker communication

- Exchange technical questions/findings/integration details within approved same-Run Tasks using active peer `dispatch:<id>` addresses. Include Task IDs and artifact references; send only needed changes to concerned peers. Missing/finished/reassigned peers go through the Orchestrator.
- Orchestrator owns assignment, dependencies and fix rounds; peer mail expands no scope, creates no workers and completes no Tasks/gates. Escalate blockers, disagreements and scope/acceptance/shared-contract changes before dependent work (`gates.md`).
- Artifact owner records implementation conclusions in the existing spec/report before reliance; notify Orchestrator once with affected IDs/references. Routine Q&A needs no relay; coordinator questions use `ask/reply`.
- After writing the report, send `worker_done` with Task/Dispatch identity, verdict, at most five summary lines and report path. `--outcome succeeded` whenever the report is written, whatever the verdict (`changes requested` and `partial` included); `failed` only for `blocked` or `failed`. Orca marks the Task from the outcome. Completion routing follows `start.md` "Coordinator delivery".

## When UI or a running app is involved

- Include `ui_rules`, viewports and the ticket's UI answers (or the chosen prototype variant). Store PO inputs in `.team/<feature>/inputs/`. Enable the visual loop only by config or PO request.
- Put in Task constraints: `Browser: Orca via orca-cli only; overrides role browser skills.` Include the `orca-cli` skill path.
- Include `delivery.md` "Local test before Gate 2" in the Builder's acceptance checks.
- Run app startup, migrations and seed scripts in Run-owned Orca terminals via `orca-cli`; keep the server in the foreground of the reused `DEV` pane, not an agent-private shell or detached process. Stream stdout/stderr to the pane and `.team/<feature>/logs/`; redact secrets. Report pane handle, cwd, commands (secrets redacted) and log paths.
- Reuse an isolated Orca browser profile per test account. Verify the server and take its URL from Orca ports before sharing.
- When screenshots are required, save them under `.team/<feature>/shots/` per viewport and color scheme. List `human_only` checks without performing them.

## Task files

Messages point to files. Store all Run files under `.team/<feature>/` via the worktree's `.team` link, never `/tmp` or `.team/<run>/`.

| Path | Writer | Content |
|---|---|---|
| `specs/NN-<role>[-rN].md` | `team spec`/`team start` | Task input, one per Task |
| `reports/NN-<role>[-rN].md` | The worker of Task NN | Task output, same NN as its spec |
| `logs/NN-<command>.log` | The worker of Task NN | Full verify, test and tool output (`WRANGLER_LOG_PATH` included) |
| `inputs/` | Orchestrator, from the PO | Reference docs, screenshots, sketches |
| `shots/` | Builder (visual loop) | Screenshots per viewport and colour scheme |
| `decisions.md` | Orchestrator | Numbered PO decisions: Gate 1 answers, scope cuts, Orchestrator defaults |
| `spec.md` | Orchestrator (`to-spec`) | Spec and test seams |
| `issues/NN-<slug>.md` | Orchestrator (`to-tickets`) | One ticket per Orca Task; `Blocked by:` line, no status |
| `handoff.md` | Orchestrator | `start.md` "Handoff"; `team init` writes the skeleton |
| `run.json` | `team` CLI | Run, workspace and each Task's spec, role and Dispatch terminals; read by `--reuse` and `team status` |

## Report

Each dispatched worker writes its own report to the Task's absolute `Output:` path, normally `.team/<feature>/reports/NN-<role>[-rN].md`. Report partial, blocked and failed outcomes as well as successful ones. Use the assigned role; reading another skill does not change the assignment. Direct PO-invoked roles use the same content with unavailable Run/Task/Dispatch IDs marked `not dispatched`.

```markdown
Role: <builder|reviewer|support-engineer>
Run: <run ID>
Task: <task ID>
Dispatch: <dispatch ID>
Workspace: <absolute checkout path and branch>
Revision: <HEAD sha; list uncommitted work or say clean; not applicable for non-code work>

## Result
<verdict word from the table below>. <outcome and unmet criteria>
## Evidence
<criteria checked, command/results, revision and raw-log paths; unverified checks explicit>
## Findings
<role-specific findings, when applicable>
## Changed paths
<paths changed>
## Commit body
<when committing or delivering>
## Leftovers
<open risks and human steps>
```

Identity, Result and Evidence are required. The first line under `## Result` starts with the role's verdict word exactly as in the table below (`changes requested.`, not `not approved` or `verdict: done`): `team status`, `team fix` and `team rereview` read it. Omit other empty sections. Report claims must name an artifact, source location or observed check; distinguish facts, hypotheses and unchecked items. Keep artifacts local and ignored; retention follows `delivery.md`.

### Content by worker role

| Role | Result | Evidence and role-specific content |
|---|---|---|
| Builder | `implemented`, `partial`, `blocked` or `failed`; behavior delivered and criteria left unmet | Map acceptance criteria to checks; final revision and per-command verify results; changed paths, deviations and leftovers. Fix rounds map each finding ID to its fix or evidence-based rejection. Delivery adds Commit body and delivery references. |
| Reviewer | `pass`, `changes requested`, `blocked` or `inconclusive`; reviewed base and HEAD | Separate `## Standards` and `## Spec`; each finding has a stable ID, Must fix/Should fix, location, impact and reproduction/evidence. Cite the requirement for Spec findings. State zero findings explicitly on each clean axis; re-review resolves prior IDs. Missing access/evidence is not a pass. |
| Support Engineer | `confirmed`, `not reproduced`, `needs clarification` or `blocked`; answer to the investigation question | Requirements summary at most 10 lines, reproduction and impact, confirmed cause or labelled hypotheses, affected paths and proposed next step/effort drivers. Ticket replies add client-language draft and PO translation; internal questions omit them. |

A report is complete when it records the attempt and its evidence, even if the verdict requires more work. A Task's acceptance and PO gates remain separate. Dispatched workers send `worker_done` only after saving the report, using the identity, verdict and path above; if saving fails, ask the coordinator with the exact path/error instead of claiming submission. Before replacing a report from an earlier Dispatch, preserve it with a `-<previous-dispatch-id>` filename suffix; the current report stays at the assigned `Output:` path. Direct PO-invoked workers return the report to the PO without `worker_done`.

### Coordinator and PO-facing roles

| Role | Durable output | Report to PO |
|---|---|---|
| Orchestrator | Feature `handoff.md`, decisions and references to each processed Task/Dispatch/report | Current result or gate, worker verdicts with report links, verification revision, unresolved risks and the next action or PO decision. Mark missing reports explicitly. |
| Researcher | `.team/research/<topic>.md` per its role skill | Research conclusion, sources, chosen scope and unresolved questions; link the note. |
| Solution Architect | `.team/architecture/<topic>.md` analysis and approved ADRs per its role skill | Recommendation, NFR/cost tradeoffs, decision state and PoC/open questions; link analysis/ADRs. |

Researcher and Solution Architect work directly with the PO and have no worker Task/Dispatch identity. Coordinator summaries cite worker reports; the worker owns its findings and evidence. Record report processing in the handoff as `Task | Dispatch | report path | verdict | reviewed revision | next action`. Receipt of `worker_done`, report existence and coordinator processing are distinct facts; this convention does not add automatic dashboard tracking.
