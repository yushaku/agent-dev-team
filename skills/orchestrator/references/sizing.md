# Sizing and work modes

- Size every request before creating anything in Orca; state size and reason in one line (`start.md`).
- Use the smallest size that keeps the non-negotiables: Builder != Reviewer for code, and the PO gates.

## Sizes

| Size | Use for | Who works | Orca | Gates |
|---|---|---|---|---|
| **S0 Direct** | Answer from code, explain behavior, tiny read-only lookups | one read-only agent session (`roles/investigator.md`); not the Orchestrator: reply in one line | Nothing created; read-only lookups (`orca reference find`, `orca search`), code via `git show`/`git grep` on the remote branch, no checkout | G-Reply if anything leaves the team |
| **S1 Solo** | One-area change, clear expected result | Builder, Anti-AI Editor, Code Reviewer | 1 worktree, no Run (or a Run with 2 Tasks) | Gate 2 |
| **S2 Standard** | A few areas, new tests needed, or one business rule changes | Product Manager (business rule change), Builder, Anti-AI Editor, Security Auditor (when triggered), Code Reviewer, QA, Perf/A11y (when triggered), Designer (new screen or flow) | 1 worktree + Run with a short DAG | Gate 1 if a business rule changes, G-UI for a new screen or flow, Gate 2 |
| **S3 Full** | New capability, unclear requirements, cross-cutting design | Product Manager, Designer (when UI), Tech Lead, Builder, Anti-AI Editor, Security Auditor (when triggered), Code Reviewer, QA, Perf/A11y (when triggered), Delivery Engineer | 1 feature worktree (+ child worktrees if parallel Builders are allowed) + Run with the full DAG (`workflow.md`) | Gate 1, G-UI when there is UI, Gate 2 |

## Choosing the size

- Start at S0; move up only on a signal:
- **S1:** any code change.
- **S2:** more than one area or layer, a business rule changes, a sensitive area (auth, payments, personal or financial data, uploads, external APIs), a new screen or user flow (Designer joins, G-UI applies), or a visual-only redesign. Changes to an existing screen stay S1 and follow `ui_rules`.
- **Architecture impact:** a job that adds an external system or vendor, a new data store, changes deployment topology, raises a load target, or moves personal data across a boundary, with no accepted Solution Architect ADR covering it, is S3. After Gate 1 pause before `plan` and ask the PO to open a Solution Architect session; resume when the ADR is accepted (docs branch merged or the PO says so).
- **S3:** requirements unclear after one clarifying round, a new capability with no business spec, or a design decision expensive to reverse.
- Several backlog items in one user loop are one S3 capability: one spec, one Build Task; say so and offer to narrow.
- **Spike** (S0 or S1): a technical question is a Solution Architect session (`roles/solution-architect.md`), which writes the ADR; a PoC runs as `workflow.md` "Other DAG shapes"; a product question is a Researcher session; the PO decides.
- Ticket work in production: `tickets.md`.
- The PO overrides any time by naming a size. Project config can set a default or a ceiling (`flow.default_size`, `flow.max_size`).

## Resizing mid-run

- **Upsize** when bigger: tell the PO, add the missing Tasks or gate, keep work done.
- **Downsize** when smaller: stop idle Tasks, finish at the smaller size.
- Never upsize silently past a gate: a new business rule always goes through Gate 1.
