# Deliver and close

## Prepare delivery

1. Remove shipped `todo.md` items; rewrite deferred ones for their later capability.
2. `docs.site: pages` without `.github/workflows/pages.yml`: copy and commit `templates/pages.yml` before review; changes beyond the copy go to a worker. The PO enables Pages (`docs-policy.md` "Published site").
3. Before any push, check `git show --stat` for commits since review: each new commit, docs-only included, gets a scoped review and Anti-AI.
4. Deliver per mode. Branch: leave the feature commits, push only with `delivery.push`. PR: the Builder runs `team pr-preflight <target>`, you push, open a draft with `delivery.pr_title` and the Builder's `## Commit body` verbatim, wait for green CI and attach the PR via Orca.
5. Record delivery as a completed Orchestrator Task (`--kind delivery`) and report link or branch, outcome, risks, pending human checks and any ticket G-Reply draft.

Feature commits stay off the default branch, merge commits stay unsquashed. An optional `Fixes-feature: <branch>` trailer overrides dashboard blame. Interrupted delivery: reconcile branch, remote, Orca and Run-owned server state, then continue authorized work and report done and pending actions.

## Local test before Gate 2

- The existing Builder runs the final revision in Run-owned `DEV`, applies migrations and seeds the changed flow with project scripts, keeping existing data. It checks readiness in Orca's browser and leaves the app running for the PO.
- Its report gives URL, account or access, seeded scenarios, manual test steps and terminal and log details (`specs.md` "UI and running app"). It lists on-device or manual `human_only` checks for the PO and says which app or data checks do not apply.
- Resolve delivery blockers, or get an explicit PO waiver, before asking for approval.

## Definition of Done (feature)

- Every ticket criterion has a passing test, measurement, rendered check or recorded manual result; pending `human_only` checks are listed; required automation and project thresholds pass.
- Zero Must fix and zero high-severity triggered-audit findings; clean Anti-AI; a green `team verify` log for the final revision.
- External services (push, mail, payments): evidence of one real end-to-end call.
- UI: delivery screenshots when the visual loop ran, otherwise `UI check: PO` under Human steps.
- Delivered per configured mode with the Builder's `## Commit body` (`skills/team-builder/references/delivery.md` "Body").

## Merge and cleanup

- **Merge on request:** an explicit PO "merge X" is Gate 2 approval and overrides `human_only` for that branch. `team close --merge` makes a merge commit on the base branch and runs verify there; a conflict or failed verify stops before anything closes. Report the pushed range and migrations.
- **Parallel branches:** integrate child or Run branches only while no Reviewer reads the target. Conflicts go to a fast Builder in a child worktree: dry-run `git merge-tree --write-tree --name-only`, resolve there, fast-forward, rerun `team verify`. Leftover Should fix items join the feature fix round. The PO tests and merges the feature once.
- **Carry-over:** at merge, open Should fix items go to `.team/carry-over.md` as numbered `file:line` entries with their fix. Later Runs act on them for blockers or PO requests; remove resolved items after merge.
- **Run cleanup:** reconcile the Run's Tasks and gates with evidence and PO decisions, and complete approved finished Tasks; cleanup itself approves no gate and cancels no work. Match each `ready` or `pending` Task to the handoff; settle a never-dispatched placeholder as `failed` with the reason and its replacement (Orca has no cancelled status). `team close` releases recorded workers and sets the board `completed`; `--remove-worktree [--delete-branch]` also removes the clean feature worktree. Keep resources for pending work and gates, and PO-owned, kept-open or possibly live sessions; report what stays and why. Close Run-owned DEV and coordinator terminals once unneeded.
- **Cleanup on request** ("dọn", "clean up", "merge everything into main"): check branches are merged, list removals and get one OK before irreversible steps, reusing explicit authorization. Keep `.team/config.yaml` and `.team/carry-over.md`; stop only this project's worktree servers.

## Close and retro

- Read `curl -s localhost:4747/api/agent/run?id=<run>` from `local.team-dashboard`; fix each high-severity issue or record why not in the delivery report.
- The Gate 2 operator records each return to work as `- Gate 2 finding: <what>` in `decisions.md`, or `- Gate 2: no findings`. The dashboard computes the other metrics.
- Retro after more than one fix round, any Gate 2 finding or a high-severity close issue; clean Runs skip it. Assign the Run's Reviewer read-only at tier work, `--kind other`, absolute `retro` skill. Input: feature artifacts, dashboard Run metrics, close output and worker sessions; output `reports/NN-reviewer-retro.md`. The PO picks which candidates change process, skills or project.
- After Gate 2, complete the close Task and keep reports, decisions and logs until explicit cleanup. A new request during another Run's Gate 2 gets its own Run (`start.md` "Run selection"); keep the older gate's testing resources and ask only about blocking dependency or ownership.
