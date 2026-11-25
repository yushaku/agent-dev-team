# Finish

## Prepare delivery

- Remove shipped `todo.md` items; rewrite deferred items for their later capability.
- `docs.site: pages` without `.github/workflows/pages.yml`: copy/commit `templates/pages.yml` before review; delegate changes beyond the copy. PO enables Pages (`docs-policy.md` "Published site").
- Before any push, inspect `git show --stat` for commits since review; new commits, including docs-only, require scoped review and Anti-AI. Branch mode: leave feature commits, push only if `delivery.push`. PR mode: push, open a draft with `delivery.pr_title` and the Builder's `## Commit body` verbatim, confirm green CI and attach PR via Orca.
- Keep feature commits off the default branch; preserve merge commits instead of squashing. Optional fix trailer `Fixes-feature: <branch>` overrides dashboard blame attribution.
- Record delivery as a completed Orchestrator Task with `Measurement.kind: delivery`; update the board (`start.md` "Board mapping"). Report link/branch, outcome, risks, pending human checks and ticket G-Reply draft.
- Interrupted delivery: reconcile branch, remote, Orca and Run-owned server state; continue authorized work and report completed/pending actions.

## Local test before Gate 2

- Existing Builder runs the final revision in Run-owned `DEV`, applies migrations and seeds the changed flow using project scripts, preserving data. Verify readiness through Orca browser and reachability at handoff; keep the app running for PO testing.
- Report URL, account/access, seeded scenarios, manual test steps and terminal/log details (`specs.md`). List on-device/manual `human_only` checks without performing them; state inapplicable app/data checks.
- Resolve delivery blockers or obtain explicit PO waiver before requesting approval.

## Close and retro

- Read `curl -s localhost:4747/api/agent/run?id=<run>` from `local.team-dashboard`; fix every high-severity issue or record why not in the delivery report.
- Gate 2 operator records each return to work as `- Gate 2 finding: <what>` in `decisions.md`, or `- Gate 2: no findings`. Dashboard computes other metrics.
- Trigger retro on more than one fix round, any Gate 2 finding or high-severity close issue. Assign the Run's Reviewer read-only, tier work, `Measurement.kind: other`, absolute `retro` skill. Input: feature artifacts, dashboard Run metrics (repo/branch), close output and worker sessions. Output: `reports/NN-reviewer-retro.md`. Send candidates to PO; change process/skills/project only for selected items. Skip retro for clean Runs.
- After Gate 2, complete the close Task; retain feature reports/decisions/logs until explicit cleanup. A new request during another Run's Gate 2 uses `start.md` "Run selection"; preserve the older gate/testing resources and ask only for blocking dependency/ownership decisions.

## Merge and cleanup

- **Merge on request:** explicit PO "merge X" overrides `human_only` for that branch. Merge on approval; report pushed range/migrations and mark completed.
- Integrate parallel child/Run branches only while no Reviewer reads the target. Delegate conflicts to a fast Builder in a child worktree; dry-run `git merge-tree --write-tree --name-only`, resolve there, then fast-forward. Rerun verify; include leftover Should fix items in the feature fix round. PO tests/merges the feature once.
- **Carry-over:** at merge, keep open Should fix items in `.team/carry-over.md` as numbered `file:line`, fix entries. Future Runs act on blockers/PO requests; remove resolved items after merge.
- **Run cleanup:** reconcile named Run Tasks/gates with evidence and PO decisions; complete approved finished Tasks, including close. Cleanup alone approves no gate and cancels no work. Retain resources for pending work/gates and protect PO-owned, kept-open and unproven live sessions. List the Run's `ready`/`pending` Tasks and match each to the handoff; settle a never-dispatched placeholder as `failed` with the reason and its replacement Task (Orca has no cancelled status). Release kept-open workers. Follow Orca recovery/cleanup and receipts; read back Task/worker state and report retained resources with reasons. Close Run-owned DEV/coordinator only when no longer needed.
- **Cleanup** ("dọn", "clean", "clean up", "merge everything into main"): verify branches are merged, list removals and obtain one OK before irreversible cleanup, reusing explicit authorization. Keep `.team/config.yaml` and `.team/carry-over.md`; stop only this project's worktree servers.

## Definition of Done (feature)

- Every ticket criterion has a passing test, measurement, rendered check or recorded manual result. List pending `human_only` checks; required automation/project thresholds pass.
- Zero Must fix and triggered-audit high-severity findings; clean Anti-AI; green `commands.verify` for the final revision.
- External services (push/mail/payments): evidence of one real end-to-end call; mocks are insufficient.
- UI: delivery screenshots when the visual loop ran, otherwise `UI check: PO` under Human steps.
- Deliver per configured mode with the Builder's `## Commit body` (`skills/team-builder/references/delivery.md` "Body").
