# Verification and fix rounds

## Worker results

- After each `worker_done`, read the full report, including deviations/leftovers. Match its Role/Run/Task/Dispatch, output path and revision to the assignment and receipt; return missing or conflicting evidence to the same worker. Reconcile `git status --short` in the worker checkout with reported paths; have an authorized committer finish delivery changes.
- Quote verify evidence in the PO update; use shas/counts only from output read this turn. Before Gate 2, require passing `commands.verify` evidence for the final revision; rerun with summary output only if missing, stale or contradictory.
- Record processed Dispatch/report references in the handoff (`start.md` "Handoff"). Missing completion follows "Coordinator delivery"; missing reports follow "Dispatch and follow-ups" there.

## Review and fixes

- Assign the independent Reviewer selected by `routing.md`; use `team-reviewer`, `code-review`, `anti-ai` and triggered security references at the required tier. Name the base branch as fixed point and spec/tickets as Spec sources. Keep `## Standards` and `## Spec` separate; include Builder leftovers and visual-loop screenshots.
- The Builder supplies tests/measurements; missing evidence returns to that Builder. Reuse passing verify evidence for the reviewed HEAD on a clean tree; otherwise the Reviewer reruns it. Run targeted checks for disputed findings or suspect evidence; prose edits or repeated review alone need no full rerun.
- Reviewer sends consolidated findings/reproduction questions to the Builder via `specs.md` "Worker communication". Orchestrator authorizes each fix round; peer mail alone does not. Builder reproduces/traces findings or rejects them with evidence; Reviewer verifies fixes/rejections and reports remaining blockers.
- Fix blockers and fix-induced regressions; defer optional improvements. Accepted tradeoffs are not new defects. Finalize docs before final review; behavior changes use `gates.md`, alignment edits need no new Task.
- Before Gate 2, amend/fixup review fixes into the commits they correct. Each round gets one scoped re-review of prior findings, rejection evidence, fix commits and finalized docs/delivery text. New findings cover only fix-induced regressions; security review follows the affected path.
- After two failed fix rounds, ask the PO how to proceed; offer one tier up. No silent third round or automatic tier increase. Delivery must satisfy `delivery.md` "Definition of Done (feature)"; list nonblocking leftovers and risks at Gate 2.

## UI rounds (one Builder Task, no full Run)

- Send concrete inline UI asks to one Builder in the feature worktree. Reuse the Task for component follow-ups; state the exact change and behavior to preserve. Batch element polish into one commit when the PO closes the round.
- For an area-wide complaint, fix the screen with most hits; list affected siblings and ask before expanding scope. Ambiguous layout: ask with recommended options.
- A reference screenshot chosen as the redesign skips prototype/G-UI; ask only about structural placement. Map real app data/controls using app tokens. A mood reference uses prototype/G-UI (`start.md` "Team decisions").
- Missing capability: deliver the UI-only part and ask whether to add the capability, retain behavior or reuse existing functionality. After merge, branch UI tweaks from `main` in the delivered worktree.
