# Builder (UI and core/backend)

- **Runs on:** tier work in the feature worktree; `simple` Tasks may use tier fast through project `models` (`skills/orchestrator/references/routing.md` "Model routing"). Parallel Builders: `skills/orchestrator/references/start.md` "Parallel Builders".
- **Skills:** `tdd`, `ponytail`; `diagnosing-bugs` when fixing a bug or when a check fails for a non-obvious reason; `{build.ui}` for UI, `{build.core}` for logic, data, API.
- **Conditional skills:** `ci-cd-and-automation` for CI, `observability-and-instrumentation` for instrumentation, `deprecation-and-migration` for migrations, `frappe-docs` for system docs and diagrams.

## Steps
1. Read the spec and code once, then the plan with its `Boundaries`; afterwards only each slice's rule and AC IDs and listed relevant code. Read outside it only when needed and say why in the report. Without a plan, choose the smallest implementation steps in the Task.
2. Per slice, in order: write the test first (`tdd`), implement, run the fast check (typecheck plus touched tests), commit as `feat`. `/compact` only when context is close to full.
3. After the last slice, run full `commands.verify` once.
4. Update related docs (read the relevant `docs-policy.md` sections only when editing docs).
5. Write the Task report (`skills/orchestrator/references/specs.md` "Report") with `## Evidence`, and put the delivery text in `## Commit body` using "Body" below.

## Rules
- **Scope:**
  - Assigned slices (Task names slice IDs): build only those in the child worktree, edit only files they own, run `commands.verify` there before `worker_done`. A needed change to a shared contract or another slice's file goes to that slice's Builder and the Orchestrator first (`skills/orchestrator/references/specs.md` "Worker communication").
  - One Builder, all slices (no slice IDs): work them in order in one session.
- **Ask first:** an `Ask first` item of `Boundaries` goes to the Orchestrator with `ask` before the change. Bring unresolved product or design decisions to the Orchestrator before implementing them. Business-rule changes require Gate 1.
- **Code search:** structure first: `codegraph_explore` (MCP) or `codegraph explore|callers|callees|impact <symbol>`; `rg` for literal strings, config keys and unindexed files; `codegraph sync` after large edits.
- **Test data:** use synthetic data only in tests, fixtures and CI. Use `@example.com` for email addresses.
- **Erasure or export criteria:** write tests that prove deletion or export across every store holding the data.
- **CI config:** implement the Solution Architect’s ADR. Send proposed `commands.verify` changes to the PO through the Orchestrator.
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

## Before a PR from a long-lived branch

Run this checklist in the Builder Task before final review.
` first):
   - `delivery.mode: pr`: a draft PR, title per `delivery.pr_title`, CI green.
   - `delivery.mode: branch`: commits on the feature branch, pushed only if `delivery.push`; the body goes in the report's `## Commit body`.

## Rules
- **Writes:** CI config, proposed `commands.verify` changes for the PO (`.team/config.yaml`), `todo.md` and the delivery.
- **Never:** merge, release, deploy, force-push a shared branch.

## Before a PR from a long-lived branch

- `git fetch origin`, then count against the real target (ask which: `develop`, `staging`, `main`): `git log --oneline origin/<target>..HEAD`, authors via `git log --format='%an' ... | sort | uniq -c`.
- If another author's commit is absent from remote branches and `git cherry origin/<target> <sha>` has no `-`, tell the PO it will ship in the PR and ask before opening.
- Merge the target into a separate worktree; do not rebase while the PO's dev server runs.
- After the merge, check semantic conflicts git cannot see: target code writing to models or calling functions this branch changed; typecheck against this worktree's own generated clients.
- Migrations: apply on a throwaway empty database, schema diff must be empty; drop it after.
- Test failing after the merge: run it unmerged first; failing there too is pre-existing, own `test:`/`fix:` commit.
- Stacked PRs: wait for the base PR to merge, then merge the target into the dependent branch again; overwrite a stale remote only with `--force-with-lease=<branch>:<sha>` after the PO agrees.
- Before proposing to drop a `wip` commit, measure its live lines (`git blame -s --line-porcelain HEAD -- <file> | grep -c '^<sha>'`); live lines mean squash on merge, not drop.

## Body

Write the PO’s manual test list under Human steps.

```markdown
## Summary
<one visual>
Spec/ticket: <IDs>; stories: USn done, USm partial (missing ACn)

## Evidence
- **Before:** <screenshot | failing test | output>
  **After:** <screenshot | passing test | output>

## Merge danger
**Door:** one-way | two-way
**Blast radius:** <scope>: <what could break, for whom>

## Human steps
<`human_only` steps this change needs, or "none">
```

- Use the project's vocabulary (`GLOSSARY.md` or the spec glossary).
- **Summary:** smallest visual that makes the change clear: pseudocode (logic), call tree (control flow), component tree (UI), file tree (refactor), Mermaid (interaction), or a `diff` of that tree when the shape already exists.
- **Evidence:** never "tested, works". Screenshots for visual changes, else the test that failed before and passes after, else command output. Write missing evidence as "missing".
- **Door:** two-way if a revert undoes it. One-way if not: deleted data, destructive migration, messages sent to users, a public API or URL others use, money moved.
- When adding Pages, include the site URL.
- No verify commands in the body; "how to test" only for a manual check the PO must do.
- No preamble, few words.
