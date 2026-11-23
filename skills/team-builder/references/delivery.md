# Delivery

- **Delivery** (per the Task spec):
  - `delivery.mode: pr`: a draft PR, title per `delivery.pr_title`, CI green.
  - `delivery.mode: branch`: commits on the feature branch, pushed only if `delivery.push`; the body goes in the report's `## Commit body`.
- **Writes:** CI config, proposed `commands.verify` changes for the PO (`.team/config.yaml`), `todo.md` and the delivery.
- **CI config:** implement the Solution Architect's ADR. Send proposed `commands.verify` changes to the PO through the Orchestrator.

## Before a PR from a long-lived branch

Run this checklist in the Builder Task before final review.

- `git fetch origin`, then count against the real target (ask which: `develop`, `staging`, `main`): `git log --oneline origin/<target>..HEAD`, authors via `git log --format='%an' ... | sort | uniq -c`.
- If another author's commit is absent from remote branches and `git cherry origin/<target> <sha>` has no `-`, tell the PO it will ship in the PR and ask before opening.
- Merge the target into a separate worktree; do not rebase while the PO's dev server runs.
- After the merge, check semantic conflicts git cannot see: target code writing to models or calling functions this branch changed; typecheck against this worktree's own generated clients.
- Migrations: apply on a throwaway empty database, schema diff must be empty; drop it after.
- Test failing after the merge: run it unmerged first; failing there too is pre-existing, own `test:`/`fix:` commit.
- Stacked PRs: wait for the base PR to merge, then merge the target into the dependent branch again; overwrite a stale remote only with `--force-with-lease=<branch>:<sha>` after the PO agrees.
- Before proposing to drop a `wip` commit, measure its live lines (`git blame -s --line-porcelain HEAD -- <file> | grep -c '^<sha>'`); live lines mean squash on merge, not drop.

## Body

Write the PO's manual test list under Human steps.

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
