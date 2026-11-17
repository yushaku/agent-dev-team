# Task specs

New Task: use this template and pass the spec's absolute path per the Orca guide. Same-Task clarifications may point to the existing spec; a new Task must carry its own metadata even when reusing the file.

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
- Include resolved skills and config values, not the whole config. Select models via `coding-agents.md`. For output, workers read "Report"; for doc changes/review, relevant `docs-policy.md` sections.
- Give known entry points and link source decisions; the Builder traces connected code. Name approval boundaries; routine reads, scoped edits, tests and authorized delivery proceed.
- Protect uncommitted/PO-kept files; include related Builder docs in scope. Follow approved business decisions; changes use `gates.md`.
- Handle observed permission failures via `coding-agents.md` "Known limits"; do not preemptively forbid commits.

## When UI or a running app is involved

- Include `ui_rules`, viewports and the selected reference/variant. Store PO inputs in `.team/<feature>/inputs/`. Enable the visual loop only by config or PO request.
- Put in Task constraints: `Browser: Orca via orca-cli only; overrides role browser skills.` Include the `orca-cli` skill path.
- Include `delivery.md` "Local test before Gate 2" in the Builder's acceptance checks.
- Run app startup, migrations and seed scripts in Run-owned Orca terminals via `orca-cli`; keep the server in the foreground of the reused `DEV` pane, not an agent-private shell or detached process. Stream stdout/stderr to the pane and `.team/<feature>/logs/`; redact secrets. Report pane handle, cwd, commands (secrets redacted) and log paths.
- Reuse an isolated Orca browser profile per test account. Verify the server and take its URL from Orca ports before sharing.
- When screenshots are required, save them under `.team/<feature>/shots/` per viewport and color scheme. List `human_only` checks without performing them.

## Task files

Messages point to files. Store all Run files under `.team/<feature>/` via the worktree's `.team` link, never `/tmp` or `.team/<run>/`.

| Path | Writer | Content |
|---|---|---|
| `specs/NN-<role>[-rN].md` | Orchestrator | Task input; follow-ups may reuse it. Embed metadata in each new Task; gates use decision material |
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
- Save raw output to `.team/<feature>/logs/`; keep artifacts local and ignored. Retention: `delivery.md`.
