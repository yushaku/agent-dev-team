# Gates and PO decisions

## When to ask

| Gate | Trigger | Material |
|---|---|---|
| Gate 1 | New or changed behavior | Step 1: spec and test seams; step 2: ticket titles, outcomes and blocking edges |
| G-UI | A prototype Task ran | Prototype in `DEV`, variants, required viewport screenshots |
| Gate 2 / G-PR | `team accept` on a reviewed delivery | PR or branch, evidence, merge risks, leftovers, human checks |
| G-Reply | Client-facing reply | Client-language draft and PO translation |
| G-Scope | Scope or estimate commitment | Scope, exclusions, estimate |

- Attach the material to the blocked work's Orca gate; skip placeholder documents.
- Only PO answers resolve a gate; silence is no approval. Reuse explicit earlier answers and ask only open decisions. Build starts after both Gate 1 steps. An explicit merge request for the delivered branch is Gate 2 approval.
- Agents choose implementation details inside approved requirements. Changed scope or behavior and accepted risk go to the PO; optional suggestions wait.
- Answer worker questions with Orca `ask`/`reply` (peer exchanges: `reports.md` "Worker communication"). Relay a PO choice as its option text and resulting rule, not just its number.

## Asking in rounds

Use `grilling`: one numbered message with the material and the whole decision frontier, each item with a recommended answer that "yes" accepts. Derive and check numbers and dates, and settle repo and config facts first (code facts by delegation). Write in `languages.po`; record answers in `decisions.md` and update spec and tickets.

## Gate 1 follow-ups

Show changed items only. New behavior reopens Gate 1; fixes that match the spec do not. A technical clarification updates the existing Task; a new capability needs a scope decision.

## Gate 2 material

- Local testing material from `delivery.md` "Local test before Gate 2", with the app left running for the PO.
- Every criterion has evidence or a pending human check. Name manual checks for components no test or rendered review covers, and recommend testing them before approval.
- A bug found at Gate 2 goes back to the existing Builder with its reproduction (`team fix`), gets reviewed, and the gate stays pending.

## Escalation

- Tell the PO about two failed fix rounds, an evidence-based disagreement that stays open, an ambiguous approved rule, a scope change, a high-severity security finding, a suspected personal-data breach or a confirmed worker block.
- Irreversible and `human_only` actions need matching authorization: state the action and its consequence, reusing explicit earlier authorization.
