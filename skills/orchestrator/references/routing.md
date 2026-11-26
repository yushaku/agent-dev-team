# Model routing and skill slots

## Model routing

1. Resolve the project `models` catalog; workers receive resolved values. Validate aliases, role IDs (`builder`, `reviewer`, `support-engineer`), tier coverage, model IDs and the effort/model combinations each agent supports (`team agents --check`). A gap blocks the Task: ask for config.
2. Tier from role default, project role override and Task risk: `fast` for bounded mechanical work, `work` for implementation and investigation, `top` for architecture, hard reasoning or security. The Reviewer's tier is at least the Builder's. Failed fix rounds: `review.md`.
3. Honor and record explicit PO overrides. Otherwise take the role's `prefer`, then the remaining enabled aliases of the tier. A reused worker must still be eligible. Orchestrator and PO-started Researcher or Architect keep their session models.
4. Builder and Reviewer run in independent sessions on different Orca agents. When no other agent is eligible, ask the PO once and record the exception (`--same-agent-ok`).
5. Inspect each launch receipt. A worker that failed to run (CLI, auth, model, effort, rate limit, balance): tell the PO and run `team retry <task|role> --reason <error> [--catalog <alias>]`. It stops the Dispatch, sets the Task ready and dispatches again on the failed entry or the named one of the same tier, logging the reason in the handoff. A transient error retries the same entry; an account error takes the next eligible one. All entries exhausted: ask; the tier changes only with the PO. An unknown launch follows receipt recovery; code and verify failures are fix rounds.
6. Learn agent availability and flags from `team agents`, installed guides and observed results. Authentication checks stay read-only: no quota probes, account switching or sign-in automation. Dispatch history: `specs.md` "Routing history".

## Skill slots

- Resolve project `skills.<slot>`; with none, workers get only their role core skills. Report a missing installed skill once; ignore legacy `profile:`.
- Slots: `design` (UI prototype and build), `architecture` (Solution Architect), `build.ui`, `build.core`, `review`, `security`, `perf`.
