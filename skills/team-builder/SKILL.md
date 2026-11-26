---
name: team-builder
description: "Use only when an Orchestrator Task assigns the Builder role or the user runs /team-builder. Builds one ticket (UI and core/backend) test-first and returns evidence."
---

# Builder (UI and core/backend)

- Use tier work, or fast for `simple` Tasks, per Orchestrator routing; keep the assigned workspace/branch.
- Load `tdd`, `ponytail`, `{build.ui}` for UI and `{build.core}` for logic/data/API.
- Conditional skills: `diagnosing-bugs` for bugs/unexplained check failures; `prototype` for prototypes; `frappe-docs` for system docs/diagrams.

## Steps
1. Read Task ticket/spec, glossary/ADRs and necessary code; justify reads beyond ticket scope in the report.
2. Build with `tdd` at spec seams, or the highest existing seam proving behavior; record fallback seams. Typecheck and run touched tests before each ticket's `feat` commit.
3. Update related docs per relevant `docs-policy.md` sections. After the final commit, run `team verify`: full `commands.verify` on the clean tree, logged per sha; `team submit` wants it green for `implemented`.
4. Fill the prefilled report at the Task's `Output:` path (content: `skills/orchestrator/references/specs.md` "Report", Builder row), then finish with `team submit <path>`: it checks the report and sends `worker_done`. Partial, blocked or failed attempts also produce a report. Delivery Tasks include `## Commit body` per `references/delivery.md`.

## Rules
- **Scope:** work assigned tickets in dependency order in one session; a named ticket uses `references/parallel.md`. Compact only near context capacity.
- **Prototype:** unmerged `prototype/<name>`, served in `DEV`; report verdict and retain only the validated decision on main.
- **Ask first:** use Orchestrator `ask` before unresolved product/design decisions, shared-contract/schema/dependency changes or edits outside the ticket.
- **Code search:** follow repo indexing rules; CodeGraph for structure, `rg` for literals/config/unindexed files; sync the index after large edits.
- **Evidence:** `## Evidence` includes failing-before/passing-after output, performance/size measurements and the `team verify` lines. Later commits require a fresh `team verify`; raw output stays in `.team/<feature>/logs/`.
- Stage explicit paths from `git status --short`, never `git add -A`. No merge, release, deploy or shared-branch force-push.

## Done when
- Every ticket is committed, all acceptance criteria have evidence and final-revision verify passes.

## References
Read Task `Refs:` and any reference whose trigger applies.
- `references/parallel.md`: the Task names one ticket (parallel Builders).
- `references/fix-round.md`: the Task answers review findings.
- `references/ui.md`: Task touches UI or the spec says `visual loop: on`.
- `references/data.md`: Task touches personal data, erasure or export, test data, or a migration in a fix round.
- `references/delivery.md`: Task delivers (PR body, draft PR or branch), a PR from a long-lived branch, or changes CI config.
- `references/perf.md`: user-facing screen change, or a path `perf_notes` marks as hot.
