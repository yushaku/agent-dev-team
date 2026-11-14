# Our data: problems in the current process (2026-11-13)

Source: team dashboard `/api/data` (Orca Runs plus agent session logs), the Orchestrator's lessons file, and the team docs. Outside evidence codes ([A3], [S1] ...) refer to `agent-teams-in-practice.md`.

## Scope and limits

- 42 Orca Runs with Tasks (repos bisou, jizen, arcra, mado); 783M tokens, cache reads included.
- $ cost covers the last 7 days only (dashboard window); Orchestrator and worker $ below share that window.
- Sessions are tagged "orchestrator" by title; some untagged direct-chat sessions ($302 in the window) also did orchestration, so P1 is a lower bound.
- "Fix" Builder Tasks are counted by title (`fix`, `round`, `follow`, `re-review`, `address`, `finding`).
- Incident evidence comes from rules written after each incident; a rule shows the incident happened at least once, not how often.

## Numbers

| Role | Tasks | Token share | $ (7 days) |
|---|---|---|---|
| Orchestrator (Hermes, 22 sessions) | n/a | n/a | 277.1 |
| All Run workers together | 423 | 100% | 246.4 |
| of which Reviewer | 86 | 17.7% | 85.2 |
| of which Builder | 145 (53 fix or follow-up) | 49.6% | 50.0 |
| of which Tech Lead | 19 | 7.5% | 47.8 |
| of which PM | 63 | 5.5% | 30.7 |
| of which QA | 11 | 6.7% | 22.0 |
| of which Designer | 7 | 2.2% | 1.1 |
| of which the rest (Delivery, Anti-AI, doc-keeper, Perf/A11y, Security, Researcher, untagged, Orchestrator close Tasks) | 92 | 10.6% | 9.7 |

Median Tasks per Run: S1 4 (13 Runs), S2 11.5 (12 Runs), S3 17 (10 Runs). Process text the Orchestrator can load: about 6.7k words of team orchestrator docs plus 26k words of its own lessons skill.

## Problems

### P1. The Orchestrator costs more than the team it runs
- Evidence: $277 for Orchestrator sessions against $246 for every Run worker in the same 7 days. One session ("Điều phối dự án Bisou") cost $79 and read 92M tokens; four more cost $19 to $31 each. All on the top model.
- Breakdown (dashboard prices, assumed Opus list price, 5 min cache): over all 22 sessions, cache reads 321M tokens (about $160), cache writes 14.6M (about $91), output 1.35M (about $34). The $79 session made 1,170 model calls at about 75k context each.
- Cause: cost = model calls x context size. Idle time is free; each wake-up is not. Every worker report, waiter notification and status check is a call that rereads the whole context (rulebook, reports, history), and a wake-up after more than 5 idle minutes rewrites the expired cache at the write price (a third of the cost).
- Outside: Gas Town, "expensive as hell" [P1]; supervision is the costly part of agent-run orchestration.
- Candidate fix: fewer wake-ups (one notification per finished Task, not per poll), a smaller context per call (short reports, a smaller rulebook, a new session per Run), a cheaper tier for routine supervision.

### P2. The spec chases the build
- Evidence: S3 Runs hold 3 to 6 PM Tasks, mostly re-syncing after the fact: "tidy after Gate 1", "align garden rules with the build", "align ADR with fix round", "R18 square photos (rule change)", "rename starred block title". Garden 5, kind notes 5, sysadmin-scope 6.
- Cause: the spec is written in full before anyone sees the product; every later decision needs a separate PM handoff to write it back.
- Outside: SOP role chains (MetaGPT, ChatDev) and handoff context loss [A3, R2].
- Candidate fix: Gate 1 approves a short decision list, not a full spec; one spec sync from the code at Delivery.

### P3. Scope changes are found late, at testing or Gate 2
- Evidence: admin-theme ran 5 polish Builder Tasks after `close`; the star scope was reversed while testing at Gate 2; a theme job flipped scope after the reviewer found un-tokenized areas; a game mechanic was mapped to the wrong kinds and corrected after content was written; kind notes replaced time capsule on the same branch.
- Cause: the PO judges from text (spec, flow walkthrough) and sees the real screen only at Gate 2.
- Outside: practitioners show a plan or a running result early [P4]; Ramp's agent attaches screenshots to its own work [S3].
- Candidate fix: a screenshot or preview URL after the first UI slice, before the remaining slices.

### P4. A full review on every UI polish round
- Evidence: Reviewer is the most expensive worker in $ (Opus, high effort). TOHAKU-2364 (S1): 18 Tasks, 9 Builder and 8 Reviewer; the payment card was verified 4 times (restyle, combined, after polish, final).
- Cause: the rule "Builder != Reviewer for every code change" applies per commit, not per round.
- Outside: review is the bottleneck [P2]; reviewers on the same model err together [A6].
- Candidate fix: during a polish round the Builder runs lint, tests and screenshots only; one Reviewer when the PO closes the round.

### P5. S2 is nearly as heavy as S3
- Evidence: median 11.5 Tasks against 17 for S3 and 4 for S1.
- Cause: S2 triggers (a second area, a rule change, any sensitive area) pull in most of the S3 chain: PM, verify, spec review, QA, re-review.
- Outside: single agent first; split only for context, parallelism or specialization [A3, O1].
- Candidate fix: S2 = short spec, one Builder, fixed checks, one clean-context Reviewer, Gate 2; PM and QA only on a named trigger.

### P6. Information is lost between agents
- Evidence (one rule per incident): Codex sent only a summary, so its deviations from the spec never arrived; Designer and PM ran in parallel and their copy diverged; a fast PM tidy contradicted a neighbouring rule; the Orchestrator stated how data persisted before any report confirmed it; it coined user-facing names that diverged from the app's wording.
- Cause: each handoff passes a summary, not the source; several agents write the same text in parallel.
- Outside: share full traces, single writer [C1, C2]; handoff chains lose context [A3].
- Candidate fix: one writer per text (the spec owns copy); workers attach the diff and the raw verify output, not a summary.

### P7. Workers need babysitting
- Evidence: `worker_done` arrived with uncommitted files (QA, Delivery, reviewer fix-ups); workers stopped without reporting; a turn was interrupted mid-merge; `orca-quirks.md` exists only for recovery cases.
- Cause: "done" is the worker's claim; the check lives in the Orchestrator's memory as a rule.
- Outside: stalled and lost workers in Gas Town [P1]; Stripe makes these deterministic steps in code [S1].
- Candidate fix: a script run on every `worker_done` (clean tree, commit present, verify command exit code) that rejects the report.

### P8. Rules only grow
- Evidence: 33k words of orchestration text; one-off rules sit beside general ones (an 18+ card box, a truth-or-dare mechanic, a single theme job's lint counting).
- Cause: every incident becomes a prose rule; nothing is retired, and nothing becomes a check in code.
- Outside: re-examine and strip the harness when models change [A5]; turning mistakes into rules works when the rules stay few [P5, P6].
- Candidate fix: a prune pass per model change; incidents that a script can catch become scripts (P7), not prose.

### P9. Fix rounds are a third of Builder work, with unknown value
- Evidence: 53 of 145 Builder Tasks are fixes or follow-ups.
- Unknown: how many fixed real defects against nits or style.
- Candidate fix: tag each finding real defect / standards / nit in the review output and count per Run.

### P10. The PO is the critical path
- Evidence: long Runs are mostly waiting: card-box 16.6 h wall with 16.0 h between Tasks; billing-b2b 29.1 h with 24.2 h idle, then closed as "no longer needed"; events 11.3 h with 10.8 h idle.
- Note: expected with human gates, and waiting itself costs no tokens. The cost is indirect: the first turn after the wait rewrites the expired cache, and every turn after it carries the whole pre-gate history.
- Candidate fix: resume after a gate in a fresh session from Orca state, so post-gate turns do not carry pre-gate history.

## Not measured

- Orchestrator cost per Run (sessions not linked to `run_id`).
- Real defect rate of review findings (P9).
- Rework caused by late scope changes, in Tasks or $ (P3).

## Open decisions

Order by expected saving: P1 (largest $), P4, then P2 and P5 (fewer handoffs), then P7 and P8 (reliability).
