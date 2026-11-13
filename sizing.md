# Sizing and work modes

- The Orchestrator sizes every request before creating anything in Orca: a fresh agent per role costs minutes of context loading.
- Use the smallest size that keeps the non-negotiables: Builder != Reviewer for code, and the PO gates.

## Sizes

| Size | Use for | Who works | Orca | Gates |
|---|---|---|---|---|
| **S0 Direct** | Answer from code, explain behavior, tiny read-only lookups | Researcher | Nothing created; read-only lookups (`orca reference find`, `orca search`), code via `git show`/`git grep` on the remote branch, no checkout | G-Reply if anything leaves the team |
| **S1 Solo** | One-area change, clear expected result | Builder, Anti-AI Editor, Code Reviewer | 1 worktree, no Run (or a Run with 2 Tasks) | Gate 2 |
| **S2 Standard** | A few areas, new tests needed, or one business rule changes | Product Manager (business rule change), Builder, Anti-AI Editor, Security Auditor (when triggered), Code Reviewer, QA, Perf/A11y (when triggered), Designer (new screen or flow) | 1 worktree + Run with a short DAG | Gate 1 if a business rule changes, G-UI for a new screen or flow, Gate 2 |
| **S3 Full** | New capability, unclear requirements, cross-cutting design | Product Manager, Designer (when UI), Tech Lead, Builder, Anti-AI Editor, Security Auditor (when triggered), Code Reviewer, QA, Perf/A11y (when triggered), Delivery Engineer | 1 feature worktree (+ child worktrees if parallel Builders are allowed) + Run with the full DAG (`workflow.md`) | Gate 1, G-UI when there is UI, Gate 2 |

## Choosing the size

- S0 work is read-only; apply `humanizer` to anything leaving the team.
- Start at S0; move up only on a signal:

- **S1:** any code change.
- **S2:** more than one area or layer, a business rule changes, a sensitive area (auth, payments, personal or financial data, uploads, external APIs), or a new screen or user flow (Designer joins, G-UI applies). Changes to an existing screen stay S1 and follow `ui_rules`.
- **S3:** requirements unclear after one clarifying round, a new capability with no business spec, or a design decision expensive to reverse.
- The Orchestrator states size and reason in one line.
- A todo item spanning several roadmap entries (one user loop) is one S3 capability: one spec, one Build Task; say so and offer to narrow.
- Size moves some roles' model tier (role cards, `coding-agents.md` "Model tiers").
- The PO overrides any time by naming a size ("run S0", "run S3").
- Project config can set a default or a ceiling (`flow.default_size`, `flow.max_size`).

## Resizing mid-run

- **Upsize** when bigger: tell the PO, add the missing Tasks or gate, keep work done.
- **Downsize** when smaller: stop idle Tasks, finish at the smaller size.
- Never upsize silently past a gate: a new business rule always goes through Gate 1.

## Work modes

- Small change: S1 (`workflow.md` "Other DAG shapes").
- Feature: S2 or S3 (`workflow.md` "Task DAG").
- Business rule change: S2 (`workflow.md` "Other DAG shapes").
- **Spike** (S0 or S1): Researcher, then Tech Lead writes an ADR if a decision is made; PO decides.
- Redesign, visual only: S2 (`workflow.md` "Other DAG shapes").
- Production ticket work: `maintenance.md`.
