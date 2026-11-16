# Task specs

Use this template for a new Task. Store it under `.team/<feature>/specs/NN-<role>[-rN].md`; pass its absolute path using the current Orca guide. A clarification within the same Task can be a message pointing to the existing spec. A follow-up that creates a new Task carries this metadata in its actual Task input, even when no new file is needed.

```text
Role: <role id>
Measurement: {"kind":"build","round":null,"cause":null}
Goal: <observable result; relevant rule/AC IDs when available>
Scope: <entry points, editable paths, source spec/decisions by path>
Constraints: <project rules, protected user files, branch/delivery rules, human_only>
Skills: <absolute SKILL.md paths; load conditional skills only when needed>
Evidence: <acceptance checks and commands.verify; serial if configured>
Output: <report path and raw-log paths under .team/<feature>/>
```

- Title: `<role>: <what>`. `Role` and `Measurement` must be in the Orca Task spec, not only a linked file; the dashboard reads them there.
- `kind`: `build`, `review`, `fix`, `re-review`, `delivery`, `close`, `spec`, `qa`, `merge`, `other`. Fix/re-review Tasks in one cycle share a positive `round`; otherwise null. Fix `cause`: `defect`, `requirements`, `scope`, `standards`, or null if unknown. Preserve metadata on retries.
- Include resolved role/project skills and relevant config values; workers need not load the whole config. Model/tier selection: `coding-agents.md`. Workers read only "Report" below for routine output; load `docs-policy.md` sections only when changing or reviewing documentation.
- Give known entry points; the Builder locates connected code within its Task. Link source decisions rather than copying another worker's prose. State exactly which actions need approval; routine reading, scoped edits, tests and authorized delivery proceed.
- Protect the PO's uncommitted files and any files the PO chose to keep. Scope includes related docs assigned to the Builder. Business behavior follows approved decisions; new behavior returns to Gate 1.
- A permission failure is handled when observed (`coding-agents.md` "Known limits"); do not preemptively forbid commits.

## When UI or a running app is involved

- Include `ui_rules`, viewports and the selected reference/variant. Store PO inputs in `.team/<feature>/inputs/`. Enable the visual loop only by config or PO request.
- Use a Run-owned `DEV` pane and a reused isolated browser profile per test account. Verify the server and take its URL from Orca ports before sharing; report the pane handle. Commands come from `orca-cli`.
- When screenshots are required, save them under `.team/<feature>/shots/` per viewport and color scheme. List `human_only` checks without performing them.

## Task files

File is the source, message is the pointer. Every file of a Run lives in `.team/<feature>/`, reached from a worktree through its `.team` link; never `/tmp` or `.team/<run>/`.

| Path | Writer | Content |
|---|---|---|
| `specs/NN-<role>[-rN].md` | Orchestrator | New Task input; message follow-ups may reuse it. Actual Task metadata follows `specs.md`; gates use their decision material |
| `reports/NN-<role>[-rN].md` | The worker of Task NN | Task output, same NN as its spec |
| `logs/NN-<command>.log` | The worker of Task NN | Full verify, test and tool output (`WRANGLER_LOG_PATH` included) |
| `inputs/` | Orchestrator, from the PO | Reference docs, screenshots, sketches |
| `shots/` | Designer, Builder (visual loop) | Screenshots per viewport and colour scheme |
| `design/` | Designer | `flow.md`, `option-a.html`... |
| `decisions.md` | Orchestrator | Numbered PO decisions: Gate 1 answers, scope cuts, Orchestrator defaults |
| `plan.md` | Assigned author, only when a separate plan is needed | `roles/tech-lead.md` |
| `walkthrough.html` | Orchestrator | Gate 1 HTML for the PO |
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
- Store raw output under `.team/<feature>/logs/`; `.team/` stays ignored and local. Retain artifacts per `delivery.md`; reports are not committed.
