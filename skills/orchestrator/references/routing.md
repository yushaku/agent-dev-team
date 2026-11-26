# Model routing and skill slots

## Model routing

1. Resolve the current project `models` catalog; workers receive resolved values. Validate types, aliases, role IDs (`builder`, `reviewer`, `support-engineer`), tier coverage, actual model IDs and agent-supported effort/model combinations. Missing/disabled eligibility blocks the Task; ask for config rather than inventing values.
2. Choose tier from role defaults, project role override and Task risk: `fast` for bounded mechanical work, `work` for implementation/investigation, `top` for architecture, hard reasoning or security. Keep risk-triggered checks and Reviewer tier at least the Builder's. Failed fix rounds follow `review.md`.
3. Honor and record explicit PO overrides. Otherwise use role `prefer`, then remaining enabled aliases in the tier. Existing workers must remain eligible before follow-up. Orchestrator and PO-started researcher/architect retain their session models.
4. Use independent Builder/Reviewer sessions and different Orca agents; if no other agent is eligible, ask once and record the exception.
5. Pass only supported resolved flags; inspect launch receipts. CLI/auth/model/effort/rate-limit/balance failures: record evidence, notify the PO and try the next eligible same-tier entry with `team retry <task|role> --catalog <alias> --reason <error>` (stops the Dispatch, sets the Task ready, dispatches, records the reason in the handoff). Unknown launches follow receipt recovery, not a fresh start. Code/verify failures follow fix-round policy. Exhausted entries: ask; no silent tier change.
6. Discover agent availability/flags through installed guides and observed results. Check authentication read-only; no quota probes, account switching or sign-in automation. Record selection and Dispatch history through `specs.md` "Routing history".

## Skill slots

- Resolve project `skills.<slot>`, otherwise role core skills only. Missing installed skill: report once; never silently skip. Ignore legacy `profile:`.
- Slots: `design` (UI prototype/build), `architecture` (Solution Architect), `build.ui`, `build.core`, `review`, `security`, `perf`.
