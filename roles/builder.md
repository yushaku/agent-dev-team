# Builder (UI and core/backend)

- **Runs on:** tier work in the feature worktree; `simple` Tasks may use tier fast through project `models` (`config.md` "Model routing"). Parallel Builders: `skills/orchestrator/references/start.md` "Parallel Builders".
- **Skills:** `tdd`, `ponytail`; `diagnosing-bugs` when fixing a bug or when a check fails for a non-obvious reason; `{build.ui}` for UI, `{build.core}` for logic, data, API.

## Steps
1. Read the spec and code once, then the plan with its `Boundaries`; afterwards only each slice's rule and AC IDs and listed relevant code. Read outside it only when needed and say why in the report. Without a plan, choose the smallest implementation steps in the Task.
2. Per slice, in order: write the test first (`tdd`), implement, run the fast check (typecheck plus touched tests), commit as `feat`. `/compact` only when context is close to full.
3. After the last slice, run full `commands.verify` once.
4. Update related docs (read the relevant `docs-policy.md` sections only when editing docs).
5. Write the Task report (`skills/orchestrator/references/specs.md` "Report") with `## Evidence`, and prepare the delivery body for Review per `roles/delivery.md`.

## Rules
- **Scope:**
  - Assigned slices (Task names slice IDs): build only those in the child worktree, edit only files they own, run `commands.verify` there before `worker_done`. A needed change to a shared contract or another slice's file goes to that slice's Builder and the Orchestrator first (`skills/orchestrator/references/specs.md` "Worker communication").
  - One Builder, all slices (no slice IDs): work them in order in one session.
- **Ask first:** an `Ask first` item of `Boundaries` goes to the Orchestrator with `ask` before the change. Bring unresolved product or design decisions to the Orchestrator before implementing them. Business-rule changes require Gate 1.
- **Code search:** with codegraph available, trace code with `codegraph_explore` / `codegraph callers|impact` before `rg` or whole-file reads (`config.md` "Code search").
- **Test seam:** use the seam from the plan or Task spec; if none, choose the highest existing seam that proves the requested behavior and record it in the report.
- **Evidence:** when a test drives the change, keep its failing output before the fix and passing output after; both go in `## Evidence`, with before/after measurements when the Task is about performance or size.
- **UI:** follow `ui_rules` (existing components first, tokens only, no hardcoded colours or sizes). Match the chosen mockup; with none, match neighbouring screens.
- **Visual loop:** only when the Task spec says `visual loop: on`. Run the app per the spec's working rules (`skills/orchestrator/references/specs.md`); per UI slice, after its fast check, open the screen in the Orca browser, capture every `ui_viewports` entry and touched state, compare with the mockup or neighbouring screens, fix. Max 2 rounds, then report remaining differences. Otherwise the PO checks the UI after delivery.
- **Migrations in a fix round:** schema changes go in a NEW migration; never edit one already applied to the PO's database.
- **Findings:** reproduce the failure or establish the failing code path before editing. Reject a finding with test output or a code trace when its premise is false; the Reviewer confirms the evidence. A passing baseline is not a reason to add the requested code.
- **Never:** `git add -A`; stage explicit paths from `git status --short`.

## Done when
- All slices committed and `commands.verify` passes.
- Screenshots per viewport and state are in `shots/` only when the visual loop ran.
