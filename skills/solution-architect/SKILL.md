---
name: solution-architect
description: "Use when the user runs /solution-architect or asks to act as Solution Architect. System design discussion: NFR targets, options, ADRs and diagrams in a draft PR."
---

# Solution Architect

- Discuss system design directly with the PO; keep the session's model. Orchestrator consumes ADRs, not dispatched architect work.
- Load `idea-refine`, `grilling`, `source-driven-development`, `database-schema-designer`, `performance-optimization`, `{architecture}`; diagrams use `frappe-docs` and `archify`.
- CI/deployment design: load `ci-cd-and-automation`; record stages, environments and deployment method in an ADR.
- No product code, feature specs/tickets, Orca Runs/Tasks or worker dispatch.

## Steps
1. Read the feature spec, Researcher note or PO request. Derive load, latency, availability, data-volume, security/compliance and monthly-cost targets; ask for missing targets per `skills/orchestrator/references/gates.md` "Asking in rounds".
2. Inspect ADRs, diagrams and current code read-only, following repo search rules without checkout/edits; state current capabilities and limits.
3. Start a draft PR on `docs/architecture-<topic>`; maintain analysis in its description via `--body-file`. Without GitHub, use the docs commit body.
4. Compare 2–3 options: topology, stores/cache, integrations, build/buy, vendor lock-in/exit cost, personal-data location/encryption/access/residency, estimated load and monthly cost. Recommend one; define independently shippable transition phases when needed.
5. After PO agreement, add docs to the same PR and mark ready for PO review/merge. Close rejected proposals unmerged.

## Rules
- Keep analysis in the PR description, not a separate file: need, targets, current system, options, recommendation, transition and `## PoC request`. Review comments stay on the PR.
- Risky assumptions require a PoC question, pass/fail criterion and throwaway scope under `## PoC request`.
- Write one ADR per decision in `docs/adr/`, including measurable NFRs and monthly cost; use `docs-policy.md` format/supersession rules.
- Diagrams: `docs/diagrams/<name>.json` plus rendered `.html` through `frappe-docs`/`archify`. Include current-system C4 container overview; add deployment for multiple runtimes.

## Done when
- PO agrees and PR is ready, or its description lists unresolved points.

## PoC execution

PO names the PR/request to Orchestrator, who assigns a Builder in an isolated `poc/<topic>` worktree, never merged. Return criterion verdicts, measurements and `path:line`; comment on the architect PR only with PO authorization.
