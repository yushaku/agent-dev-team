# Task specs

Pass each Task's spec by absolute path. Follow-ups may reuse the file; new Tasks carry their own metadata.

```text
Role: <role id: builder|reviewer|support-engineer>
Run: <owning Orca Run ID from start.md "Run selection">
Measurement: {"kind":"build","round":null,"cause":null}
Routing: {"tier":"work","catalog":"<alias>","agent":"<agent-id>","model":null,"effort":null}
Routing-log: <absolute .team/<feature>/routing.jsonl path>
Selection: <why this tier and catalog entry fit the Task>
Ticket: <absolute path of the ticket file; replaces Goal and Scope>
Goal: <only without a ticket (review, delivery, close, investigation): observable result>
Scope: <only without a ticket: entry points, editable paths, spec/decisions by path>
Spec: <absolute path of .team/<feature>/spec.md, seams included>
Workspace: <exact Orca workspace selector, absolute checkout path and branch>
Peers: <related same-Run Task IDs, roles and current Dispatch IDs when known>
Constraints: <project rules, `matt.glossary`, `matt.adr`, protected user files, branch/delivery rules, human_only; UI ticket: `ui_rules` and `design` slot skills>
Skills: <load skill team-<role> first, then other absolute SKILL.md paths; load conditional skills only when needed>
Refs: <known Task-specific references; worker selects applicable role references after loading its skill>
Evidence: <acceptance checks and commands.verify; serial if configured>
Output: <report path and raw-log paths under .team/<feature>/>
```

- Title: `<role>: <what>`. `Role`, `Measurement`, `Routing` and `Routing-log` must be in the Orca Task spec, not only a linked file; the dashboard reads them there.
- Before each `task-create`, check the spec file has all four lines, `Run:` and, for `fix`/`re-review`, a positive `round`. Every new unit of work (build, fix, re-review, retro, close) is its own `task-create`, started by `--task <id>`; reuse the same worker with `--terminal <handle>`. Start Builders and Reviewers with `--keep-open` so that handle stays reusable. Do not hand new work to a settled Dispatch with `send`: Orca turns it into a follow-up Task without this metadata. Use `send` only to steer a worker on its current Task.
- `kind`: `build`, `review`, `fix`, `re-review`, `delivery`, `close`, `merge`, `other`. Fix/re-review Tasks in one cycle share a positive `round`; otherwise null. Fix `cause`: `defect`, `requirements`, `scope`, `standards`, or null if unknown. Preserve metadata on retries.
- Link tickets without restating them. Put the assigned role skill and resolved project slots in `Skills:` by absolute path, including `disable-model-invocation` skills. Workers load their role skill, resolve its core/conditional skills and read applicable references; the coordinator uses this contract to dispatch.
- Pass resolved config/skills, not the full config. Models follow `routing.md`; Dispatch records follow "Routing history". Workers use "Report" and relevant `docs-policy.md` sections for docs.
- Include an absolute pointer to "Worker communication" below in each Task's Constraints; supply related peer Dispatch IDs when available and refresh them after reassignment.
- Set `Workspace:` per `start.md` "Shared feature workspace"; isolated Tasks name their child worktree and integration target. Workers need coordinator approval to change checkout/branch or create another worktree.
- With `codegraph: on`, add to Constraints: "Code search: codegraph first (`codegraph_explore` MCP or `codegraph explore|callers|impact` CLI) for symbols, callers and impact; `rg` only for literal text. Do not `cat` whole files to find a symbol." (`skills/init-team/references/config-schema.md` "Code search setup").
- Link source decisions and approval boundaries; include related docs and protect user files. Routine scoped reads, edits, tests and authorized delivery proceed; changed decisions use `gates.md`, permission failures use `start.md` "Worker permissions".

## Routing history

- At Task creation, fill `Routing:` with the initial selection, keeping null for omitted flags, and `Routing-log:` with the absolute `.team/<feature>/routing.jsonl` path. Orca Task specs are create-only in this CLI; later selections belong in that log.
- After a successful dispatch receipt, append `{"task":"<task-id>","dispatch":"<dispatch-id>","tier":"work","catalog":"<alias>","agent":"<agent-id>","model":null,"effort":null}` with resolved values. Check the Dispatch id first: receipt replay retains its existing record rather than appending a duplicate.
- A retry/replacement gets its own record before follow-up work. Preserve previous attempts and pass the log path in the Run handoff.
- The dashboard reads only matching Task records contained in `.team/` and binds settings to the exact Dispatch window; missing/ambiguous records stay unverified.

## Worker communication

- Exchange technical questions/findings/integration details within approved same-Run Tasks using active peer `dispatch:<id>` addresses. Include Task IDs and artifact references; send only needed changes to concerned peers. Missing/finished/reassigned peers go through the Orchestrator.
- Orchestrator owns assignment, dependencies and fix rounds; peer mail expands no scope, creates no workers and completes no Tasks/gates. Escalate blockers, disagreements and scope/acceptance/shared-contract changes before dependent work (`gates.md`).
- Artifact owner records implementation conclusions in the existing spec/report before reliance; notify Orchestrator once with affected IDs/references. Routine Q&A needs no relay; coordinator questions use `ask/reply`.
- After writing the report, send `worker_done` with Task/Dispatch identity, verdict, at most five summary lines and report path. Completion routing follows `start.md` "Coordinator delivery".

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
| `specs/NN-<role>[-rN].md` | Orchestrator | Task input; follow-ups may reuse it. Embed metadata in each new Task |
| `reports/NN-<role>[-rN].md` | The worker of Task NN | Task output, same NN as its spec |
| `logs/NN-<command>.log` | The worker of Task NN | Full verify, test and tool output (`WRANGLER_LOG_PATH` included) |
| `inputs/` | Orchestrator, from the PO | Reference docs, screenshots, sketches |
| `shots/` | Builder (visual loop) | Screenshots per viewport and colour scheme |
| `decisions.md` | Orchestrator | Numbered PO decisions: Gate 1 answers, scope cuts, Orchestrator defaults |
| `spec.md` | Orchestrator (`to-spec`) | Spec and test seams |
| `issues/NN-<slug>.md` | Orchestrator (`to-tickets`) | One ticket per Orca Task; `Blocked by:` line, no status |
| `handoff.md` | Orchestrator | `start.md` "Handoff" |

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
<role verdict, outcome and unmet criteria>
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

Identity, Result and Evidence are required. Omit other empty sections. Report claims must name an artifact, source location or observed check; distinguish facts, hypotheses and unchecked items. Keep artifacts local and ignored; retention follows `delivery.md`.

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
