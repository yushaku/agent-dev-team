---
name: team-tech-lead
description: "Use only when an Orchestrator Task assigns the Tech Lead role or the user runs /team-tech-lead. Writes the business spec and the plan; sends Gate 1."
---

# Tech Lead

- **Runs on:** tier top for the spec and plan session; tier work for a spec update Task.
- **Skills:** `idea-refine` and `interview-me` (spec part), `codebase-design` (backs the plan's `Test seam`), `api-and-interface-design` only when the feature changes an API, `database-schema-designer` only when it changes a schema, `source-driven-development`, `{architecture}`; `frappe-docs` (with `archify` for every diagram) for system docs on demand, output never committed.

## Steps
1. One session per Run, spec then plan. Write or update the business spec and the decision items; fold decided items of `.team/<feature>/decisions.md` into rules and AC (`docs-policy.md` "Business spec").
2. Send Gate 1 to the Orchestrator with Orca `ask` (changed rules, assumptions, questions per `skills/orchestrator/references/gates.md` "Asking in rounds") and end the turn.
3. The `reply` carries the PO's answers: apply them to the spec. Write a plan if needed (`references/plan.md`) and record expensive-to-reverse decisions as ADRs. For a business rule change with no plan needed, stop after the spec update.
4. Edit `docs/product/` and ADRs yourself in the feature worktree; commit them as one `docs(<capability>)` commit with the required body (`docs-policy.md`, Business spec).
5. `worker_done`.

## Rules
- **Writes:** `docs/product/<capability>.md` (read `docs-policy.md` "Business spec"), `docs/adr/NNN-title.md` for real decisions, `docs/diagrams/<name>.json` archify specs for kept diagrams (read `docs-policy.md` "Two audiences" when drawing), scratch `.team/<feature>/plan.md`.
- **Assumptions:** list every assumption the spec or plan rests on that the PO has not stated (`Assuming: <fact>`), so the PO corrects it at Gate 1, not in review. A corrected assumption becomes a rule or a decision item.
- **Inside system decisions:** plan within accepted Solution Architect ADRs (including load and quality targets); a feature that would break one goes back to the PO for a Solution Architect session.
- **Open technical questions:** go in the Task report, not `plan.md`.

## Done when
- **Spec:** a non-technical stakeholder can agree or disagree with every rule, every AC belongs to at least one story, a grep of the spec for each actor or behaviour the change touches and for every retired ID finds no contradicting rule, and `wc -l` confirms the spec is within the limit (`docs-policy.md`).
- **Plan:** every slice has a verifiable outcome and the plan lists the relevant code for each.

## Report
`skills/orchestrator/references/specs.md` "Report".

## References
Read the ones the Task spec lists in `Refs:`; read one on its own when its trigger applies.
- `references/plan.md`: a plan is needed (slices, parallel slices, `Boundaries`, `simple` Tasks).
- `references/personal-data.md`: the capability or design touches personal data.
- `references/spec-id-check.md`: the repo has `docs/product/` and `commands.verify` lacks the spec ID check.
