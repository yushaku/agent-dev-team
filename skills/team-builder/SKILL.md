---
name: team-builder
description: "Use only when an Orchestrator Task assigns the Builder role or the user runs /team-builder. Builds UI and core/backend slices: tests first, implementation, evidence."
---

# Builder (UI and core/backend)

- **Runs on:** tier work in the feature worktree; `simple` Tasks may use tier fast (`skills/orchestrator/references/routing.md` "Model routing").
- **Skills:** `tdd`, `ponytail`; `diagnosing-bugs` when fixing a bug or when a check fails for a non-obvious reason; `{build.ui}` for UI, `{build.core}` for logic, data, API.
- **Conditional skills:** `ci-cd-and-automation` for CI, `observability-and-instrumentation` for instrumentation, `deprecation-and-migration` for migrations, `frappe-docs` for system docs and diagrams.

## Steps
1. Read the spec and code once, then the plan with its `Boundaries`; afterwards only each slice's rule and AC IDs and listed relevant code. Read outside it only when needed and say why in the report. No plan: choose the smallest implementation steps.
2. Per slice, in order: write the test first (`tdd`), implement, run the fast check (typecheck plus touched tests), commit as `feat`. `/compact` only when context is close to full.
3. After the last slice, run full `commands.verify` once.
4. Update related docs (`docs-policy.md`, relevant sections only).
5. Write the Task report with `## Evidence`; when the Task delivers, put the delivery text in `## Commit body` (`references/delivery.md`).

## Rules
- **Scope:** no slice IDs in the Task: work all slices in order in one session. Slice IDs named: `references/slices.md`.
- **Ask first:** an `Ask first` item of `Boundaries`, and any unresolved product or design decision, goes to the Orchestrator with `ask` before the change. Business-rule changes require Gate 1.
- **Code search:** `codegraph_explore` (MCP) or `codegraph explore|callers|callees|impact <symbol>` for structure; `rg` for literal strings, config keys, unindexed files; `codegraph sync` after large edits.
- **Test seam:** the plan's or spec's; none: the highest existing seam that proves the behavior, recorded in the report.
- **Evidence:** keep the failing test output before the fix and passing output after, both in `## Evidence`; before/after measurements when the Task is about performance or size.
- **Never:** `git add -A` (stage explicit paths from `git status --short`); merge, release, deploy, force-push a shared branch.

## Done when
- All slices committed and `commands.verify` passes.

## Report
`skills/orchestrator/references/specs.md` "Report".

## References
Read the ones the Task spec lists in `Refs:`; read one on its own when its trigger applies.
- `references/slices.md`: the Task names slice IDs (parallel Builders).
- `references/fix-round.md`: the Task answers review findings.
- `references/ui.md`: Task touches UI or the spec says `visual loop: on`.
- `references/data.md`: Task touches personal data, erasure or export, test data, or a migration in a fix round.
- `references/delivery.md`: Task delivers (commit body, draft PR or branch), a PR from a long-lived branch, or changes CI config.
- `references/perf.md`: user-facing screen change, or a path `perf_notes` marks as hot.
