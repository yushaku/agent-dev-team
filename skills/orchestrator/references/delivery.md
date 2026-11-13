# Finish

- The Delivery Task delivers per `delivery.mode`; for `branch`, push only if `delivery.push`. In `pr` mode run `orca worktree set --pr <n>` after the Delivery Engineer opens the PR, and move the card (`start.md` "Board mapping").
- Tell the PO: link or branch, summary, risks, `human_only` steps left, (tickets) the fix report draft for G-Reply.
- After Gate 2, complete the `close` Task, close your terminal and tell the PO to start a new session for the next work. Delete `.team/<feature>/` when closing the Run; keep `.team/carry-over.md` and `.team/research/`.
- A new request while a Run waits at Gate 2: ask whether to merge first and start it on a fresh branch (recommended: one Gate 2 per capability) or fold it in; offer an older Run waiting only at Gate 2 as approve, leave pending or close in the same question. Then ask the new scope questions one at a time.
- Gate 2 open while the PO tests: a PO merge request counts as approval.
- Before any push, inspect `git show --stat` for every commit since the last review. Commits added after the last review get a scoped review plus Anti-AI; docs-only commits get a scoped review too.
- **Merge on request:** the PO's explicit "merge X" overrides `human_only` for that one branch. Merge on approval; report the pushed range and migrations, then move the card to `completed`.
- Merge a parallel Run into the feature or named branch only when no Reviewer is reading that branch; resolve conflicts in a fast Builder Task, rerun verify, add its leftover Should fix to the feature's fix round. The PO tests and merges once.
- Resolve conflicts in a child worktree, never in a checkout the PO uses: dry-run `git merge-tree --write-tree --name-only`, then fast-forward.
- **Carry-over:** Should fix items left at merge go to `.team/carry-over.md`, one numbered line each (file:line, the fix). The next feature Run's Tech Lead reads it and plans the items as their own slice (no Tech Lead: the Builder's first slice, one `fix:` commit); items for a later capability are named at Gate 1. After that merge, rewrite the file with only what is still open.
- **Run cleanup:** release settled workers, close the DEV pane and the Orchestrator terminal (`orca-quirks.md` "Recovery").
- **Cleanup** ("merge everything into main", "clean up"): check each branch is merged, list the cleanup and get one OK (irreversible), then act; keep `.team/config.yaml` and `.team/carry-over.md`. Stop only the dev servers of this project's worktrees.

## Definition of Done (feature)

- Every acceptance criterion in the business spec maps to a passing test.
- Zero Must fix findings; triggered audits: zero high-severity findings.
- Anti-AI pass clean.
- `commands.verify` green.
- A feature calling an external service (push, mail, payments): one real end-to-end call with its evidence in the delivery; mocked tests do not count.
- UI changes: screenshots in the delivery only when the visual loop ran; otherwise "UI check: PO" under Human steps.
- Delivered per `delivery.mode` with the body in `roles/delivery.md`.
