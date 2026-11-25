# Gates and PO decisions

## When to ask

| Gate | Trigger | Material |
|---|---|---|
| Gate 1 | New/changed behavior | Step 1: spec and test seams; step 2: ticket titles, outcomes and blocking edges |
| G-UI | Prototype Task ran | Prototype in `DEV`, variants and required viewport screenshots |
| Gate 2 / G-PR | Reviewed delivery | PR/branch, evidence, merge risks, leftovers and human checks |
| G-Reply | Client-facing reply | Client-language draft and PO translation |
| G-Scope | Scope/estimate commitment | Scope, exclusions and estimate |

- Attach material to the blocked work's Orca gate. After final review, use a close Task for Gate 2 (`specs.md`); omit placeholder documents.
- Only PO answers resolve gates; absence is not approval. Reuse explicit prior answers; ask only unresolved decisions. Dispatch build after both Gate 1 steps. An explicit merge request for the delivered branch counts as Gate 2 approval.
- Agents choose implementation details within approved requirements. Changed scope/behavior or accepted risk needs the PO; defer optional suggestions.
- Answer worker questions through Orca ask/reply; peer exchanges follow `specs.md`. Relay PO choices as option text and resulting rule, not only an option number.
- **Asking in rounds:** use `grilling`: present material and the full decision frontier in one numbered message, each with a recommended answer that "yes" accepts. Derive/check numbers and dates; resolve repo/config facts first, delegating code facts. Present in `languages.po`; record answers in `decisions.md` and update spec/tickets.

## Gate 1 material

- Follow-ups show changed items only. New behavior reopens Gate 1; fixes matching the spec do not. Technical clarification updates the existing Task; new capability requires a scope decision.

## Gate 2 material

- Include local testing material from `delivery.md` "Local test before Gate 2" and keep the app running for the PO.
- Every criterion needs evidence or a pending human check. Name manual checks for components uncovered by tests/rendered review and recommend testing before approval.
- Bugs found at Gate 2 return to the existing Builder with reproduction evidence; review fixes and keep the gate pending.

## Escalation

- Notify the PO for two failed fix rounds, unresolved evidence-based disagreement, ambiguous approved rules, scope changes, high-severity security findings, suspected personal-data breaches or confirmed worker blocks.
- Irreversible and `human_only` actions require applicable authorization. State the action/consequence; reuse existing explicit authorization.
