# Reports and worker communication

For workers writing a report and the Orchestrator reading one.

## Report

`team dispatch` prefills the report at the spec's `Output:` path with Role, Run, Task, Dispatch, Workspace and one `FILL:` line per required section; a report an earlier Dispatch left there moves to `<name>-<dispatch>.md`. The worker replaces every FILL line and runs `team submit <path>`. It checks the report (verdict word, Evidence, both review axes, a clean tree and green `team verify` log for `implemented` and `pass`), writes `Revision:` and sends `worker_done`. If submit cannot send, ask the coordinator with the exact path and error.

- Report every attempt, partial, blocked and failed included: a report is complete when it records the attempt and its evidence. Task acceptance and PO gates stay separate.
- Each claim names an artifact, source location or observed check. Label facts, hypotheses and unchecked items as such.
- Roles the PO starts directly use the same content with Run, Task and Dispatch `not dispatched`, check it with `team submit <path> --check` and hand it to the PO.

| Role | `## Result` starts with | Evidence and role content |
|---|---|---|
| Builder | `implemented`, `partial`, `blocked` or `failed`; behavior delivered, criteria left unmet | Each acceptance criterion with its check; `team verify` lines for the final revision; changed paths, deviations, leftovers. Fix rounds map each finding ID to its fix or an evidence-based rejection. Delivery adds `## Commit body` and delivery references. |
| Reviewer | `pass`, `changes requested`, `blocked` or `inconclusive`; reviewed base and HEAD | `## Standards` and `## Spec`, each finding with a stable ID, Must fix or Should fix, location, impact and evidence; Spec findings cite the requirement. A clean axis says zero findings. Re-review marks each prior ID. Missing access or evidence is `inconclusive`. |
| Support Engineer | `confirmed`, `not reproduced`, `needs clarification` or `blocked`; the answer | Requirement summary (10 lines at most), reproduction and impact, confirmed cause or labelled hypotheses, affected paths, next step and effort drivers. Ticket replies add a client-language draft with PO translation. |

## Coordinator and PO-facing roles

| Role | Durable output | Report to PO |
|---|---|---|
| Orchestrator | `handoff.md` with each processed Task, Dispatch and report | Current result or gate, worker verdicts with report links, verified revision, open risks, next action or PO decision. Name missing reports. |
| Researcher | `.team/research/<topic>.md` | Conclusion, sources, scope, open questions; link the note. |
| Solution Architect | `.team/architecture/<topic>.md` and approved ADRs | Recommendation, NFR and cost tradeoffs, decision state, PoC and open questions; link them. |

Coordinator summaries cite worker reports; the worker owns its findings. `worker_done` received, report written and report processed are three separate facts.

## Worker communication

- Exchange technical questions, findings and integration details with peers of the same Run at their active `dispatch:<id>` address, with Task IDs and artifact paths, and only to the peers concerned. A missing, finished or reassigned peer goes through the Orchestrator.
- The Orchestrator owns assignment, dependencies and fix rounds. Peer mail stays inside approved scope; blockers, disagreements and changes to scope, acceptance or a shared contract go to the Orchestrator before dependent work (`gates.md`).
- The artifact owner records a conclusion in its spec or report before others rely on it, then notifies the Orchestrator once with the IDs. Questions for the coordinator use `ask`/`reply`.
