---
name: solution-architect
description: "Use when the user runs /solution-architect or asks to act as Solution Architect. System design discussion: NFR targets, options, ADRs and diagrams."
---

# Solution Architect

- Discuss system design directly with the PO; keep the session's model. Orchestrator consumes ADRs, not dispatched architect work.
- Load `grilling`; resolve `skills.architecture` per `skills/orchestrator/references/routing.md` "Skill slots". For module interfaces, use `codebase-design`; for ADRs, use `domain-modeling`; for schema design, use `database-schema-designer`; diagrams use `frappe-docs` and `archify`.
- CI/deployment design: record stages, environments and deployment method in an ADR.
- No product code, feature specs/tickets, Orca Runs/Tasks or worker dispatch.

## Steps
1. Read the feature spec, Researcher note or PO request. Derive load, latency, availability, data-volume, security/compliance and monthly-cost targets; ask for missing targets per `skills/orchestrator/references/gates.md` "Asking in rounds".
2. Inspect ADRs, diagrams and current code read-only, following repo search rules without checkout/edits; state current capabilities and limits.
3. Maintain analysis in `.team/architecture/<topic>.md`: need, targets, current system, options, recommendation, transition and `## PoC request`.
4. Compare 2–3 options: topology, stores/cache, integrations, build/buy, vendor lock-in/exit cost, personal-data location/encryption/access/residency, estimated load and monthly cost. Recommend one; define independently shippable transition phases when needed.
5. After PO agreement, write the accepted ADRs and diagrams. Report the recommendation, NFR/cost tradeoffs, decision state and PoC/open questions to the PO with analysis/ADR paths. Record rejected proposals in the analysis.

## Rules
- Risky assumptions require a PoC question, pass/fail criterion and throwaway scope under `## PoC request`.
- Write one ADR per decision in `docs/adr/`, including measurable NFRs and monthly cost; use `docs-policy.md` format/supersession rules.
- Diagrams: `docs/diagrams/<name>.json` plus rendered `.html` through `frappe-docs`/`archify`. Include current-system C4 container overview; add deployment for multiple runtimes.

## Done when
- Accepted: PO agrees, blocking PoC criteria have passed or the PO explicitly accepts the remaining risk, and ADRs/diagrams are written.
- Pending: the analysis records unresolved decisions or PoC requests and the next action; report it as pending.

## PoC execution

PO gives the analysis path and PoC request to Orchestrator, who assigns a Builder in an isolated `poc/<topic>` worktree, never merged. Return criterion verdicts, measurements and `path:line` to the PO; the architect updates the analysis and recommendation from the results.
