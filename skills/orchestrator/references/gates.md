# Gates and PO decisions

## When to ask

| Gate | Trigger | Material for the PO |
|---|---|---|
| Gate 1 | New or changed behavior | Step 1: the `to-spec` spec and its test seams. Step 2: the `to-tickets` slices (title, what it delivers) and blocking edges |
| G-UI | A prototype Task ran (the PO must see it to choose, or a wholly new screen, `ui_rules.gate` on) | Prototype in the `DEV` pane, variants and required viewport screenshots |
| Gate 2 / G-PR | Reviewed delivery | PR/branch, evidence, merge risks, leftovers and human checks |
| G-Reply | Client-facing reply | Draft in client language and PO translation |
| G-Scope | Ticket scope or estimate commitment | Scope, exclusions and estimate |

- Record each gate on the work it blocks via the Orca guide. After final review, Gate 2 uses a close Task (`specs.md`). Attach decision material; skip placeholder documents.
- Only the PO resolves a gate. A merge request for the delivered branch counts as Gate 2 approval. An absent PO is not approval.
- Explicit scope answers already supplied by the PO count toward Gate 1; record them and ask only about unresolved decisions. Avoid asking twice. Build Tasks are not dispatched before both Gate 1 steps are confirmed.
- Orchestrator/Builder chooses implementation details within approved requirements. Ask about changed behavior/scope or risks needing PO acceptance; defer optional review suggestions.
- Answer questions escalated to the Orchestrator through the version-matched ask/reply flow; direct peer exchanges follow `specs.md` "Worker communication". Present the material before asking.
- **Asking in rounds:** use the `grilling` format: the whole frontier in one message, numbered, each with a recommended answer worded so "yes" accepts it. Ask only what the PO decides: look up repo, config and code facts first (a read-only subagent or worker Task when code must be read).
- Relay a PO pick on a worker's options as the option's text and the rule it sets, never only its number.

## Gate 1 material

- Orchestrator checks derived numbers/dates, presents in `languages.po`, records answers in `decisions.md` and folds them into the spec or tickets.
- Follow-ups show only changed items. New behavior reopens Gate 1; fixes to match the approved spec do not.
- Technical clarifications update the existing Task. A new capability needs its own scope decision.

## Gate 2 material

- Include the ready local URL, test account/access, seeded scenarios, test steps and terminal/log details from `delivery.md` "Local test before Gate 2"; keep the app running until the PO finishes testing.
- Every criterion has suitable evidence or an explicit pending human check. If neither automated tests nor rendered review cover a component, name the manual checks and recommend testing before approval.
- A bug found while Gate 2 is open goes to the existing Builder, with reproduction evidence; review the fix and keep the gate pending.

## Escalation

Notify the PO for two failed fix rounds, unresolved evidence-based disagreement, ambiguous approved rules, scope changes, high-severity security findings, suspected personal-data breaches or confirmed worker blocks.

Irreversible actions and actions reserved by `human_only` require the applicable authorization. Report the concrete action and consequence; follow existing explicit authorization instead of asking again.
