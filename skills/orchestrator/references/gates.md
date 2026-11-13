# Gates (human)

- Create each gate on the Task it blocks, then show the PO its material.
- Gate 2: create a `close` Task depending on the last review, then run `gate-create --task <close> --options '["approve","changes"]' --question "<branch> into <target>" --from <handle>`.
- G-UI: use an `after G-UI` Task and options `["A","B","changes"]`.
- Keep placeholder specs for gate Tasks in the current Run's scratch directory.
- After the PO answers, run `gate-resolve --id <gate> --resolution "<the PO's answer>" --from <handle>`, then `task-update --id <close> --status completed`.
- Material per gate:
  - Gate 1: walkthrough in `languages.po` (`## Gate 1 material`).
  - G-UI (`ui_rules.gate` on): screenshots of 2 or 3 options per viewport.
  - G-Reply: draft in `languages.client` with a `languages.po` translation.
  - G-Scope: scope and estimate.
  - Gate 2 / G-PR: the draft PR link or branch and delivery body, merge danger first.
- If the PO is away, choose the option that changes nothing outside the repo and tell the PO; never resolve a gate.
- Worker questions: answer with `orchestration reply --id <question msg id>` (a worker that asked has ended its turn; `send` does not wake it). Answer technical choices yourself and state them in the next PO update:
  - A technical choice no user would notice (edge case, a guard or test-only config edit the plan missed, a forced visible fallback): follow existing behaviour, name the test after the AC, state it in the next PO update for veto.
  - Reviewer Nice to have and "PO decision?" notes no user would notice: take them as defaults, one line each for veto.
  - Anything a customer or user would notice goes to the PO as questions, one at a time, recommended option first.
- A bug the PO finds while Gate 2 is open: one Builder fix Task (failing reproduction first) on that branch; the fix joins the delivery and the gate stays pending.

## Gate 1 material

- Never send only the spec. Send a plain-language walkthrough: user stories first (one line each), rules that change today's behaviour, one concrete example, short bullets. Ask the PO to confirm it. The example stays out of the spec (`docs-policy.md` "Business spec").
- Scope answers given in the start message count as Gate 1: create no gate object; record the Run decisions per `docs-policy.md` "Business spec (PM output)". Start PM and Tech Lead together afterward.
- Gaps found later get Orchestrator defaults in a PM update Task; tell the PO each default in one line for veto. Do not start a second round.
- Before Gate 1, recheck derived numbers and dates in the walkthrough against the spec and new labels against the closest existing format. Send mismatches and fixes to the PM in one line.

## Gate 2 material

- For a component with no automated tests and no rendered review, list the exact manual checks and recommend "test first, then approve"; keep the gate pending until the PO answers.

## Changed decisions

- A business rule changed after Gate 1, including a UI ask that breaks an approved rule, is never an inline edit: return to Gate 1 with a diff and 2 or 3 options with one concrete example, recommended option first.
- Spec feedback after Gate 1: one PM update Task per gate, never one per remark. Builders link the numbered decision item (`specs.md`). Show the PO only the changed rule list.
- If current code breaks a Gate 1 answer, treat it as a bug in the same Run: PM update Task, then a Builder Task with a failing regression test. Tell the PO which answer exposed it.
- Reopening a closed decision as a new capability is a feature, not a fix. Ask the scope questions (rules, edge behaviour, this branch or after v1), one at a time, before building.

## Escalation

Ping the PO immediately when:

- A task fails its fix loop twice (`review.md`).
- Two roles disagree and no ADR settles it.
- Code and business spec disagree (`docs-policy.md` "Conflicts").
- Scope must change versus the approved spec.
- A security finding is high severity.
- A personal data breach is suspected, in any flow: report at once with what is known; the legal deadline is the PO's.
- A worker is blocked for more than a few minutes.
- Any action is irreversible: force-pushing shared branches, migrations against real data, deleting branches or data, spending money.
