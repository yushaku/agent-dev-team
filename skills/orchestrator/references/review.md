# Results and fix rounds

## Read each report

- Read the full report, deviations and leftovers included. Match Role, Run, Task, Dispatch, output path and revision to the assignment; return missing or conflicting evidence to the same worker.
- Reconcile `git status --short` in the worker checkout with the reported paths; an authorized committer finishes delivery changes.
- Verify evidence is the `team verify` log for the reported sha (`logs/verify-<sha>.log`); `team submit` refuses `implemented` and `pass` without a green one. In PO updates quote its lines, with shas and counts read this turn.

## Next command

| Report | Command |
|---|---|
| Builder `implemented`, first build | `team review --catalog <alias>`: Reviewer per `routing.md`, base...HEAD, ticket and Builder report as refs |
| Reviewer `changes requested` | `team fix` |
| Builder `implemented` in a fix round | `team rereview`: prior finding IDs and fix delta go into the spec |
| Reviewer `pass` | `team accept` (verify, Stage, board `in-review`), then Gate 2 (`delivery.md`) |
| Verdict wording that disagrees with its findings | the matching command with `--read-as <verdict>`; the handoff keeps both readings |
| `partial`, `blocked`, `failed`, `inconclusive` | the gap goes back to the same worker or to the PO (`gates.md` "Escalation") |
| Worker stopped on an error without a report | `routing.md` rule 5 (`team retry`) |

Round commands reuse the same worker and ticket, number the round, pass the reports as refs and write the `Processed` line; add `--constraint` for scope notes. Findings reach the Builder through the review report: Orca accepts new work for a finished Dispatch only from the coordinator.

## Fix rounds

- The Reviewer uses `team-reviewer`, `code-review`, `anti-ai` and triggered security references at the required tier, with the base branch as fixed point and spec and tickets as Spec sources; it gets Builder leftovers and visual-loop screenshots.
- Severity follows the `team-reviewer` Must fix list: a ticket criterion without a test is Must fix even when the report calls it Should fix (read it with `--read-as`). Fix blockers and fix-induced regressions; defer optional improvements. Accepted tradeoffs are no new defects.
- The Builder supplies tests and measurements, reproduces or traces each finding or rejects it with evidence. The Reviewer reuses `team verify --reuse` and runs targeted checks only for disputed findings or suspect evidence.
- Finalize docs before the final review; behavior changes go through `gates.md`. Before Gate 2, fixups are amended into the commits they correct.
- Each round gets one scoped re-review: prior findings, rejection evidence, fix commits, finalized docs and delivery text. New findings cover fix-induced regressions only; security review follows the affected path.
- Two failed fix rounds: ask the PO and offer one tier up. `team fix` refuses round 3 until called with `--round 3` after PO approval. At Gate 2, list nonblocking leftovers and risks.

## UI rounds (one Builder Task in the Run)

- Send concrete inline UI asks to one Builder in the feature worktree, reusing its Task for component follow-ups: the exact change and the behavior to keep. Batch element polish into one commit when the PO closes the round.
- An area-wide complaint: fix the screen with most hits, list affected siblings and ask before widening scope. Ambiguous layout: ask with recommended options.
- A reference screenshot chosen as the redesign skips prototype and G-UI; ask only about structural placement, and map real app data and controls with app tokens. A mood reference goes through prototype and G-UI (`plan.md` "Team decisions").
- Missing capability: deliver the UI-only part and ask whether to add the capability, keep current behavior or reuse existing functionality. After merge, branch UI tweaks from `main` in the delivered worktree.
