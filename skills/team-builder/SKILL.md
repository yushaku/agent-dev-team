---
name: team-builder
description: "Use only when an Orchestrator Task assigns the Builder role or the user runs /team-builder. Builds one ticket (UI and core/backend) test-first and returns evidence."
---

# Builder (UI and core/backend)

- **Runs on:** tier work in the feature worktree; `simple` Tasks may use tier fast (`skills/orchestrator/references/routing.md` "Model routing").
- **Skills:** `tdd`; `diagnosing-bugs` when fixing a bug or when a check fails for a non-obvious reason; `prototype` for a prototype Task; `ponytail`; `{build.ui}` for UI, `{build.core}` for logic, data, API.
- **Conditional skills:** `ci-cd-and-automation` for CI, `observability-and-instrumentation` for instrumentation, `deprecation-and-migration` for migrations, `frappe-docs` for system docs and diagrams.

## Steps
1. Read the ticket and spec named in the Task, the glossary and ADRs from Constraints, then only the code the ticket needs; say in the report why you read outside it.
2. Build the ticket with `tdd` at the spec's seams, one `feat` commit per ticket; run the fast check (typecheck plus touched tests) before it. `/compact` only when context is close to full.
3. Update related docs (`docs-policy.md`, relevant sections only).
4. After the last ticket, commit, then run full `commands.verify` once on a clean tree, each command through `rtk err` (`rtk test` for test runners).
5. Write the Task report with `## Evidence`; when the Task delivers, put the delivery text in `## Commit body` (`references/delivery.md`).

## Rules
- **Scope:** no ticket named in the Task: work the Task's tickets in dependency order in one session. A ticket named: `references/parallel.md`.
- **Prototype Task:** build on `prototype/<name>` (never merged), serve it in the `DEV` pane, report the verdict; the main branch keeps only the validated decision.
- **Ask first:** an unresolved product or design decision, a change to a shared contract, schema or dependency, or a file outside the ticket goes to the Orchestrator with `ask` before the change.
- **Code search:** `codegraph_explore` (MCP) or `codegraph explore|callers|callees|impact <symbol>` for structure; `rg` for literal strings, config keys, unindexed files; `codegraph sync` after large edits.
- **Test seam:** the spec's; none: the highest existing seam that proves the behavior, recorded in the report.
- **Evidence:** raw output in `.team/<feature>/logs/`; the failing test before the fix and the passing test after, both in `## Evidence`; before/after measurements for performance or size. `commands.verify` evidence names the sha it ran on (`git rev-parse HEAD`) and the per-command result; a later commit makes it stale, so rerun.
- **Never:** `git add -A` (stage explicit paths from `git status --short`); merge, release, deploy, force-push a shared branch.

## Done when
- Every ticket's acceptance criteria have evidence, the tickets are committed and `commands.verify` passes.

## Report
`skills/orchestrator/references/specs.md` "Report".

## References
Read the ones the Task spec lists in `Refs:`; read one on its own when its trigger applies.
- `references/parallel.md`: the Task names one ticket (parallel Builders).
- `references/fix-round.md`: the Task answers review findings.
- `references/ui.md`: Task touches UI or the spec says `visual loop: on`.
- `references/data.md`: Task touches personal data, erasure or export, test data, or a migration in a fix round.
- `references/delivery.md`: Task delivers (PR body, draft PR or branch), a PR from a long-lived branch, or changes CI config.
- `references/perf.md`: user-facing screen change, or a path `perf_notes` marks as hot.
