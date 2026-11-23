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

Write the PO's manual test list under Human steps. Format: `pr` skill (`$AGENT_SKILLS_DIR/pr/SKILL.md`): Summary visual, Evidence before/after, Merge Danger (Door, Blast Radius). Team additions:

- First line after Summary: `Tickets: <NN-slug list>; spec: <path>`.
- **Evidence:** write missing evidence as "missing". Raw logs stay in `.team/<feature>/logs/`.
- **Human steps:** `human_only` steps this change needs, or "none".
- When adding Pages, include the site URL.
- No verify commands in the body; "how to test" only for a manual check the PO must do.
