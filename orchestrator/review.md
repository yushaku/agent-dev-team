# Verification and fix rounds

- Write verification specs while the last build runs.
- One `verify` Task runs Anti-AI, then Security when triggered, then Review in one session at the highest tier of the roles it covers, on an agent meeting every capability and constraint of those roles (`coding-agents.md` "Routing"; today `claude`).
- `verify` writes `## Standards`; at S1 it also writes `## Spec`.
- At S2/S3, a fresh Reviewer Task writes `## Spec` only, using the diff, capability spec and plan, at the Reviewer's tier.
- QA and Perf/A11y are separate parallel Tasks only when size or a trigger requires them.
- List Builder-reported leftovers in each spec.
- If the visual loop ran, UI Builders attach screenshots for the Reviewer to check.
- Group findings into 2 or 3 sequential fix Tasks by area; test first and reject wrong findings with a reason.
- Run no more than 2 fix rounds, then escalate to the PO.
- Route document findings by the owner column in `docs-policy.md`; use a Builder Task only for `CHANGELOG.md`.
- Keep Business spec edits in a separate PM Task.
- Review-finding fixes go into the commit they fix before Gate 2 (amend or fixup); UI asks follow "UI rounds" below.
- Send a fix to the settled Builder of that area (`orca.md` "Commands"); start fresh only if `worker-list` cannot prove it reusable or the fix needs another tier or agent. Reviewers and re-reviews always start fresh.
- An approved mechanic's inherent limit is not a finding; record it in ADR Consequences and tell the PO it is accepted.
- Run one scoped re-review per finding axis each round; include Anti-AI and Security findings. Security audits each Run once.
- Re-review specs contain only prior numbered findings and fix commits (`git show <fix sha>`), never the full spec or branch diff.
- After 2 failed fix rounds, ask the PO how to proceed. Offer one tier up as the recommended option; never tier up automatically.
- After round 2, send any remaining Should fix to Gate 2 as an explicit "approve" or "approve + fix X" choice with size and real-world risk; never run a silent third round.
- Send a finding that asks to rewrite an applied migration to the PO with why it was not done.

## UI rounds (one Builder Task, no full Run)

- An inline UI ask with concrete behaviour goes to one Builder Task in the feature worktree, never a full team or your own edit.
- Send follow-up asks on the same component to the running Task with the exact change and what must keep working.
- For element-by-element polish (selector or DOM excerpt), make one `fix(ui)` commit for the batch once the PO says the round is done.
- For typed input behaviour such as money formatting or defaults, use a pure helper with tests.
- For layout rules, use the stack's shell reference.
- If a complaint covers an area (for example text overlapping on language switch), fix the screen with the most hits fully, report sibling screens with the same pattern as a file list, and ask before touching them.
- If unsure which element the PO means, quote it as rendered.
- If the PO has no layout in mind, offer 2 or 3 concrete layouts with real items and counts, recommended option first.
- A reference screenshot is the chosen redesign: no Designer or G-UI; ask only about placement that changes structure (tab, full page, sheet). Map it to the app's real data and controls using app tokens, not the reference colours.
- A reference offered as mood needs a Designer Task with 2 options in light and dark, then G-UI.
- If the PO skips the Designer for a new screen, skip UX Tasks and G-UI; the Tech Lead plan names layout from existing screens and components, then the PO polishes.
- If a UI ask implies a missing capability, ship the UI-only part and ask whether to build the capability (recommended: a team Run), keep old behaviour, or reuse what exists.
- After merge, put such a tweak on a fresh branch from `main` in the delivered worktree. When the capability follows, rename that branch into the feature branch with `git branch -m` so one Gate 2 covers both.
- A UI ask that contradicts an approved rule is a changed decision (`orchestrator/gates.md` "Changed decisions").
