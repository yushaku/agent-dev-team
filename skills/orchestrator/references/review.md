# Verification and fix rounds

- One independent Reviewer runs `verify` on requirements, code, tests, changed docs and delivery body. Include Anti-AI and triggered Security checks (`checks/`) at the highest required tier; extra workers follow `start.md` "Team decisions".
- `verify` writes `## Standards` and `## Spec`; deduplicate findings across them. Include Builder leftovers and screenshots when the visual loop ran.
- The Builder supplies tests and measurements; the Reviewer checks that evidence (`checks/perf-a11y.md`); missing evidence goes back to the Builder, not to another worker.
- Reuse passing verification evidence for the reviewed revision. Run targeted checks for a disputed finding, changed behavior or suspect evidence; run full `commands.verify` once after the final code fix. Repeating review or editing prose alone does not require another full suite.
- The Reviewer sends consolidated findings and reproduction questions directly to the existing Builder via `specs.md` "Worker communication". The Orchestrator authorizes each fix round and supplies the current Dispatch; peer mail alone does not start a new round. Before editing, the Builder reproduces/traces each issue or rejects it with evidence. The independent Reviewer verifies fixes and confirms rejections or supplies counterexamples; send the resulting verdict and remaining blockers to the Orchestrator.
- Fix only blockers and fix-induced regressions. Defer optional improvements until PO request; accepted tradeoffs are not new defects.
- Finalize related docs before final review. Business-rule changes follow `gates.md`; wording/implementation alignment needs no new Tech Lead Task.
- Review-finding fixes go into the commit they fix before Gate 2 (amend or fixup); UI asks follow "UI rounds" below.
- One scoped re-review per fix round covers the prior findings, rejection evidence, named fix commits and finalized docs/delivery text. Add findings only for regressions introduced by the fix; Security checks the affected path, not a second full audit.
- After 2 failed fix rounds, ask the PO how to proceed, with one tier up as an option. Never start a silent third round or automatically raise the tier.
- At Gate 2, list nonblocking leftovers and concrete risks; delivery must meet `delivery.md` "Definition of Done (feature)".

## UI rounds (one Builder Task, no full Run)

- An inline UI ask with concrete behaviour goes to one Builder Task in the feature worktree, never a full team or your own edit.
- Send follow-up asks on the same component to the running Task with the exact change and what must keep working.
- Batch element-by-element polish (selector or DOM excerpt) into one commit once the PO closes the round.
- If a complaint covers an area, fix the screen with the most hits fully, report sibling screens with the same pattern as a file list, and ask before touching them.
- Ambiguous element/layout: ask the PO with options, recommended first.
- A reference screenshot is the chosen redesign: no Designer or G-UI; ask only about placement that changes structure (tab, full page, sheet). Map it to the app's real data and controls using app tokens, not the reference colours.
- A reference offered as mood needs a Designer Task with 2 options in light and dark, then G-UI.
- If the PO skips the Designer for a new screen, skip UX Tasks and G-UI; the Builder Task or existing plan names layout from existing screens and components, then the PO polishes.
- If a UI ask implies a missing capability, ship the UI-only part and ask whether to build the capability (recommended: a team Run), keep old behaviour, or reuse what exists.
- After merge, put such a tweak on a fresh branch from `main` in the delivered worktree.
