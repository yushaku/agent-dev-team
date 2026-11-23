# Task specs

New Task: use this template and pass the spec's absolute path per the Orca guide. Same-Task clarifications may point to the existing spec; a new Task must carry its own metadata even when reusing the file.

```text
Role: <role id: builder|reviewer|support-engineer>
Measurement: {"kind":"build","round":null,"cause":null}
Routing: {"tier":"work","catalog":"<alias>","agent":"<agent-id>","model":null,"effort":null}
Routing-log: <absolute .team/<feature>/routing.jsonl path>
Selection: <why this tier and catalog entry fit the Task>
Ticket: <absolute path of the ticket file; replaces Goal and Scope>
Goal: <only without a ticket (review, delivery, close, investigation): observable result>
Scope: <only without a ticket: entry points, editable paths, spec/decisions by path>
Spec: <absolute path of .team/<feature>/spec.md, seams included>
Peers: <related same-Run Task IDs, roles and current Dispatch IDs when known>
Constraints: <project rules, `matt.glossary`, `matt.adr`, protected user files, branch/delivery rules, human_only; UI ticket: `ui_rules` and `design` slot skills>
Skills: <load skill team-<role> first, then other absolute SKILL.md paths; load conditional skills only when needed>
Refs: <references of team-<role> to read for this Task, e.g. ui, data; none>
Evidence: <acceptance checks and commands.verify; serial if configured>
Output: <report path and raw-log paths under .team/<feature>/>
```

- Title: `<role>: <what>`. `Role`, `Measurement`, `Routing` and `Routing-log` must be in the Orca Task spec, not only a linked file; the dashboard reads them there.
- `kind`: `build`, `review`, `fix`, `re-review`, `delivery`, `close`, `merge`, `other`. Fix/re-review Tasks in one cycle share a positive `round`; otherwise null. Fix `cause`: `defect`, `requirements`, `scope`, `standards`, or null if unknown. Preserve metadata on retries.
- A ticket Task points at its ticket file and does not restate it. Skills with `disable-model-invocation` (`to-spec`, `to-tickets`, `grill-with-docs`, `triage`, `improve-codebase-architecture`, `retro`) go in `Skills:` by absolute path. Choose `Refs:` from the ticket and Task content using the trigger lines in the role skill's "References"; the worker reads only those.
- Include resolved skills and config values, not the whole config. Resolve models from `.team/config.yaml` via `routing.md` "Model routing" and record each Dispatch under "Routing history" below. For output, workers read "Report"; for doc changes/review, relevant `docs-policy.md` sections.
- Include an absolute pointer to "Worker communication" below in each Task's Constraints; supply related peer Dispatch IDs when available and refresh them after reassignment.
- With `codegraph: on`, add to Constraints: "Code search: codegraph first (`codegraph_explore` MCP or `codegraph explore|callers|impact` CLI) for symbols, callers and impact; `rg` only for literal text. Do not `cat` whole files to find a symbol." (`skills/init-team/references/config-schema.md` "Code search setup").
- The Builder traces connected code from the ticket; link source decisions. Name approval boundaries; routine reads, scoped edits, tests and authorized delivery proceed.
- Protect uncommitted/PO-kept files; include related Builder docs in scope. Follow approved business decisions; changes use `gates.md`.
- Handle observed permission failures via `start.md` "Worker permissions"; do not preemptively forbid commits.

## Routing history

- At Task creation, fill `Routing:` with the initial selection, keeping null for omitted flags, and `Routing-log:` with the absolute `.team/<feature>/routing.jsonl` path. Orca Task specs are create-only in this CLI; later selections belong in that log.
- After a successful dispatch receipt, append `{"task":"<task-id>","dispatch":"<dispatch-id>","tier":"work","catalog":"<alias>","agent":"<agent-id>","model":null,"effort":null}` with resolved values. Check the Dispatch id first: receipt replay retains its existing record rather than appending a duplicate.
- A retry/replacement gets its own record before follow-up work. Preserve previous attempts and pass the log path in the Run handoff.
- The dashboard reads only matching Task records contained in `.team/` and binds settings to the exact Dispatch window; missing/ambiguous records stay unverified.

## Worker communication

- Workers may exchange technical questions, findings, reproductions and integration details directly within approved Tasks in the same Run. Use `orca orchestration send` to the supplied `dispatch:<id>` per the version-matched guide; include Task IDs and relevant file/report references. Send only the question or change needed, to the peers concerned; avoid routine broadcasts or copying full specs/reports.
- Direct exchanges use current, active peer Dispatches. Route a missing, finished or reassigned peer through the Orchestrator before sending more work; peer messages do not authorize new Tasks, extra edit scope or new workers.
- The Orchestrator owns assignment, DAG dependencies and fix-round limits. Escalate blockers, unresolved disagreements and proposed scope, acceptance-criteria or shared-contract changes before dependent work proceeds; PO gates follow `gates.md`.
- The assigned artifact owner records conclusions that affect implementation in the existing spec/report before others rely on them. Notify the Orchestrator once with the conclusion, affected Task IDs and artifact reference; routine questions and answers need no relay. Keep spec and report files as the durable sources.
- Send `worker_done` to the Orchestrator with the required Task/Dispatch identity and report. Peer mail does not complete Tasks, release dependencies or resolve gates. Use `ask/reply` for questions requiring the Orchestrator.

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
| `handoff.md` | Orchestrator | `skills/orchestrator/SKILL.md` |

## Report

Use the output path assigned in the Task, normally `.team/<feature>/reports/NN-<role>[-rN].md`. Omit empty sections.

```markdown
## Result
<verdict and delivered behavior>
## Evidence
<check results and raw-log paths; unverified checks explicit>
## Findings
<numbered findings by severity, when reviewing>
## Changed paths
<paths changed>
## Commit body
<when committing or delivering>
## Leftovers
<open risks and human steps>
```

- `worker_done`: verdict, at most five summary lines and report path. The Orchestrator reads the report, not the transcript.
- Save raw output to `.team/<feature>/logs/`; keep artifacts local and ignored. Retention: `delivery.md`.
