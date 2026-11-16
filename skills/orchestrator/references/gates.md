# Gates and PO decisions

## When to ask

| Gate | Trigger | Material for the PO |
|---|---|---|
| Gate 1 | New or changed business rules | Plain-language stories, changed rules, one example, unresolved decisions |
| G-UI | New screen/flow with `ui_rules.gate` on | Chosen design alternatives and required viewport screenshots |
| Gate 2 / G-PR | Reviewed delivery | PR/branch, evidence, merge risks, leftovers and human checks |
| G-Reply | Client-facing reply | Draft in client language and PO translation |
| G-Scope | Ticket scope or estimate commitment | Scope, exclusions and estimate |

- Record gates using the version-matched Orca guide on the work they block. Gate 2 uses a close Task after final review; its metadata follows `specs.md`. A gate needs its decision material, not a separate placeholder document.
- Only the PO resolves a gate. A merge request for the delivered branch counts as Gate 2 approval. An absent PO is not approval.
- Explicit scope answers already supplied by the PO count toward Gate 1; record them and ask only about unresolved decisions. Avoid asking twice.
- Within approved requirements, the Orchestrator/Builder chooses implementation details. Ask when user-visible behavior or scope would differ from what was approved, or a risk requires PO acceptance. Optional review suggestions stay deferred.
- Answer worker questions through the version-matched ask/reply flow. Present the material before asking; one question at a time, recommended option first.

## Gate 1 material

- The assigned author sends the spec and open questions. The Orchestrator presents the business change in `languages.po`, checks derived numbers/dates, records PO answers in `decisions.md`, and returns them to the same author.
- Show only changed rules for a follow-up. New business behavior returns to Gate 1; correcting code to meet an already approved rule is a bug fix, not another spec approval.
- Technical clarifications update the existing Task. A new capability needs its own scope decision.

## Gate 2 material

- Every criterion has suitable evidence or an explicit pending human check. If neither automated tests nor rendered review cover a component, name the manual checks and recommend testing before approval.
- A bug found while Gate 2 is open goes to the existing Builder, with reproduction evidence; review the fix and keep the gate pending.

## Escalation

Notify the PO for two failed fix rounds, unresolved evidence-based disagreement, ambiguous approved rules, scope changes, high-severity security findings, suspected personal-data breaches or confirmed worker blocks.

Irreversible actions and actions reserved by `human_only` require the applicable authorization. Report the concrete action and consequence; follow existing explicit authorization instead of asking again.
