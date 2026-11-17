# Finish

- The Builder delivers using `roles/delivery.md`, normally within its existing Task; a separate Delivery Task needs the reason in `start.md` "Team decisions". Deliver per `delivery.mode`; for `branch`, push only if `delivery.push`. In `pr` mode run `orca worktree set --pr <n>` after the assigned worker opens the PR, and move the card (`start.md` "Board mapping").
- Report link/branch, summary, risks, pending `human_only` steps and ticket fix draft for G-Reply.
- **Local test before Gate 2:** the existing Builder runs the final revision in the Run-owned `DEV` pane, applies local migrations and seeds test data covering the changed flow. Reuse project scripts; preserve existing data. Verify readiness via Orca browser and keep it running for PO testing. Report URL, test account/access, seeded scenarios, short test steps and terminal/log details per `specs.md`; blockers must be resolved or explicitly waived by the PO before approval is requested. For changes with no runnable app/data, state what is inapplicable.
- After Gate 2, complete the close Task and retain `.team/<feature>/` reports, decisions and logs for process evaluation. Hand off only when context or ownership requires it; delete artifacts only on an explicit cleanup request.
- A new request while a Run waits at Gate 2: ask whether to merge first and start it on a fresh branch (recommended: one Gate 2 per capability) or fold it in; offer an older Run waiting only at Gate 2 as approve, leave pending or close in the same question. Then ask the new scope questions one at a time.
- Before any push, inspect `git show --stat` for every commit since the last review. Commits added after the last review get a scoped review plus Anti-AI; docs-only commits get a scoped review too.
- **Merge on request:** the PO's explicit "merge X" overrides `human_only` for that one branch. Merge on approval; report the pushed range and migrations, then move the card to `completed`.
- Merge a parallel Run into the feature or named branch only when no Reviewer is reading that branch; resolve conflicts in a fast Builder Task, rerun verify, add its leftover Should fix to the feature's fix round. The PO tests and merges once.
- Resolve conflicts in a child worktree, never in a checkout the PO uses: dry-run `git merge-tree --write-tree --name-only`, then fast-forward.
- **Carry-over:** at merge, write open Should fix items to `.team/carry-over.md`, one numbered line each (`file:line`, fix). The next Run reads them; act only on blockers or PO requests. After its merge, retain only open items.
- **Run cleanup:** follow the version-matched `orchestration` recovery/cleanup reference and worker receipts. Preserve PO-owned, kept-open and unproven live sessions; close only the Run-owned DEV pane and coordinator terminal when no longer needed.
- **Cleanup** ("merge everything into main", "clean up"): check each branch is merged, list the cleanup and get one OK (irreversible), then act; keep `.team/config.yaml` and `.team/carry-over.md`. Stop only the dev servers of this project's worktrees.

## Definition of Done (feature)

- Evidence for every acceptance criterion: passing test, measurement, rendered check or recorded manual result. Mark pending `human_only` checks for PO review; required automation and project thresholds must pass.
- Zero Must fix findings; triggered audits: zero high-severity findings.
- Anti-AI pass clean.
- `commands.verify` green.
- A feature calling an external service (push, mail, payments): one real end-to-end call with its evidence in the delivery; mocked tests do not count.
- UI changes: screenshots in the delivery only when the visual loop ran; otherwise "UI check: PO" under Human steps.
- Delivered per `delivery.mode` with the body in `roles/delivery.md`.
