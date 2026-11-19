# Model routing and skill slots

Read by the Orchestrator before dispatch. Config schema: `skills/init-team/references/config-schema.md`.

## Model routing

1. Read the main checkout's `.team/config.yaml` before planning a Run, on resume and before dispatch/follow-up; refresh it when changed. Workers receive resolved settings, not the full catalog. Keep existing workers only while their settings remain eligible; a newly disabled entry is not eligible for further work.
2. Choose the Task tier from its role and risk. `fast`: a bounded mechanical/simple edit; `work`: implementation, investigation and multi-behaviour fixes; `top`: architecture decisions, difficult reasoning or security-sensitive work. Role cards supply defaults, including the Builder's simple-Task fast option; an explicit project role tier overrides that default. Task risk may require a higher tier at initial planning; failed fix rounds still follow the PO escalation gate. Preserve required checks and keep the Reviewer's tier at least the Builder's. A config override cannot remove a risk-triggered check.
3. Honor an explicit PO model override for the stated Task and record the exception; ask only for missing routing values, not repeat approval. Otherwise use the configured eligibility rules. Use the role's `prefer` order, then remaining enabled aliases in the tier. Agent availability and supported flags come from the installed Orca/agent guides and observed launch results. Check authentication only through a supported read-only command; no quota probes, account switching or sign-in automation.
4. Pass only the entry's resolved flags that the selected agent supports. Verify the launch receipt. Missing CLI, authentication failure, unsupported flags/model or rate limit: record the evidence, then try the next eligible entry in the same tier and notify the PO. A repeated ambiguous launch uses the receipt's recovery path, not a fresh launch. An actual code/verify failure follows fix-round policy, not automatic provider retries. If no entry works, ask the PO; never silently lower the tier or start an unapproved higher-tier fix round.
5. Builder and Reviewer use independent sessions/Dispatches; they may use the same provider/model. Orchestrator and direct Researcher/Solution Architect sessions retain their session model; dispatched workers follow the catalog. Record the chosen alias, tier, agent, model, effort and selection reason in each Task (`skills/orchestrator/references/specs.md`).
6. Validate types, alias references, role ids and required tier coverage before dispatch. Require a matching model when an effort flag needs one; use the selected agent's supported effort values rather than a universal effort ladder. Reject placeholder model ids. A missing/disabled eligible entry blocks the affected Task; ask for a config decision rather than inventing a model.

## Skill slots

- Slots: `design`, `architecture`, `build.ui`, `build.core`, `review`, `security`, `perf`.
- Resolution: project `skills.<slot>` > empty (role core skills only). A slot skill not installed: tell the PO once, never skip silently.
- A config with a `profile:` key: ignore the key.
