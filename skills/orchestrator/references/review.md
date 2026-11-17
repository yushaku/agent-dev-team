# Verification and fix rounds

- One independent Reviewer runs `verify`: requirements, code, tests, changed docs and delivery body. Include Anti-AI and triggered Security checks in that session, at the highest required tier. A second reviewer needs a specific uncovered risk (`start.md` "Team decisions").
- `verify` writes `## Standards` and `## Spec`; deduplicate findings across them. Include Builder leftovers and screenshots when the visual loop ran.
- The Builder supplies tests and relevant measurements. Add QA or Perf/A11y only for evidence the existing workers cannot provide; keep required checks even when responsibilities are combined.
- Reuse passing verification evidence for the reviewed revision. Run targeted checks for a disputed finding, changed behavior or suspect evidence; run full `commands.verify` once after the final code fix. Repeating review or editing prose alone does not require another full suite.
- Send one consolidated set of blocking findings to the existing Builder. Before editing, it reproduces the issue or traces the failing path; it may reject a false premise with evidence. The Reviewer confirms the rejection or supplies a counterexample. Unresolved blockers remain open and escalate to the PO after the round limit.
- Fix rounds cover blockers and regressions introduced by the fixes. Optional improvements go to delivery leftovers; start work on them only if the PO requests it. Review must not turn an accepted tradeoff into a new defect.
- The assigned author finalizes related docs once the solution settles, before final review. A changed business rule goes through Gate 1; wording or implementation alignment does not need another Tech Lead Task.
- Review-finding fixes go into the commit they fix before Gate 2 (amend or fixup); UI asks follow "UI rounds" below.
- One scoped re-review per fix round covers the prior findings, rejection evidence, named fix commits and finalized docs/delivery text. Add findings only for regressions introduced by the fix; Security checks the affected path, not a second full audit.
- After 2 failed fix rounds, ask the PO how to proceed, with one tier up as an option. Never start a silent third round or automatically raise the tier.
- At Gate 2, list nonblocking leftovers with their concrete risks. Zero Must fix and zero high-severity audit findings remain required for delivery.

## UI rounds (one Builder Task, no full Run)

- An inline UI ask with concrete behaviour goes to one Builder Task in the feature worktree, never a full team or your own edit.
- Send follow-up asks on the same component to the running Task with the exact change and what must keep working.
- Batch element-by-element polish (selector or DOM excerpt) into one commit once the PO closes the round.
- If a complaint covers an area, fix the screen with the most hits fully, report sibling screens with the same pattern as a file list, and ask before touching them.
- If unsure which element or layout the PO means, ask, with options and the recommended one first.
- A reference screenshot is the chosen redesign: no Designer or G-UI; ask only about placement that changes structure (tab, full page, sheet). Map it to the app's real data and controls using app tokens, not the reference colours.
- A reference offered as mood needs a Designer Task with 2 options in light and dark, then G-UI.
- If the PO skips the Designer for a new screen, skip UX Tasks and G-UI; the Builder Task or existing plan names layout from existing screens and components, then the PO polishes.
- If a UI ask implies a missing capability, ship the UI-only part and ask whether to build the capability (recommended: a team Run), keep old behaviour, or reuse what exists.
- After merge, put such a tweak on a fresh branch from `main` in the delivered worktree.
