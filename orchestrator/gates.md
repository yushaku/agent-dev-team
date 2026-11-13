# Gates (human)

- Create each gate on the Task it blocks, then show the PO its material.
- Gate 2: create a `close` Task depending on the last review, then run `gate-create --task <close> --options '["approve","changes"]' --question "<branch> into <target>" --from <handle>`.
- G-UI: use an `after G-UI` Task and options `["A","B","changes"]`.
- Put placeholder specs for gate Tasks in the current Run's scratch directory; cleanup deletes older Runs' scratch and a missing spec fails with ENOENT.
- After the PO answers, run `gate-resolve --id <gate> --resolution "<the PO's answer>" --from <handle>`, then `task-update --id <close> --status completed`.
- Gate 1: send the PO a walkthrough in `languages.po` (`## Gate 1 material`).
- G-UI (`ui_rules.gate` on): show screenshots of 2 or 3 options per viewport.
- G-Reply: draft in `languages.client` with a `languages.po` translation.
- G-Scope: show scope and estimate.
- Gate 2 / G-PR: show the draft PR link or branch and delivery body, with merge danger first.
- If the PO is away, choose the option that changes nothing outside the repo and tell the PO; never resolve a gate.
- Worker questions: answer with `orchestration reply --id <question msg id>` (a worker that asked has ended its turn; `send` does not wake it). Answer technical choices yourself and state them in the next PO update:
  - Spec AC vs built behaviour on an edge (inclusive end, off-by-one date): follow what the app already does, test named after the AC, one-line PM Task on the AC in parallel.
  - A guard or test-only config edit the plan missed, with no runtime, schema or dependency change: approve under deviations, regression test named after the rule.
  - A technical limit forcing a visible fallback: the smaller user-readable cap, tests at the edge, the rule queued for the next PM Task, one line to the PO for veto.
  - Reviewer Nice to have and "PO decision?" notes no user would notice: take them as defaults, one line each for veto.
  - Anything a customer or user would notice goes to the PO as questions asked one at a time, recommended option first.
- A bug the PO finds while Gate 2 is open: one Builder fix Task (failing reproduction first) on that branch; the fix joins the delivery and the gate stays pending. A production bug while a newer branch is open: fix it there, tell the PO production keeps it until that merge, offer a hotfix branch from `main` only if they cannot wait.

## Gate 1 material

- Never send only the spec. Send the walkthrough in lifecycle order: user stories first (one line each), rules that change today's behaviour, one running example customer with real dates, a timeline table where a clock runs, short bullets. Ask the PO to confirm it. The running example stays out of the spec (`docs-policy.md` "Business spec").
- Ask at most 4 product decisions through the running example, one at a time, recommended option first. Then ask one last question listing the remaining rules for a blanket "agree".
- Technical details such as entry language and ids are your call; state them in the gate result.
- Answers to all scope questions in the start message (placement, visibility, privacy, blanket "agree") count as Gate 1. Create no gate object; record Run decisions per `docs-policy.md` "Business spec (PM output)". Start PM and Tech Lead together afterward.
- Gaps found later, or opened by a removed limit, get Orchestrator defaults in a PM update Task; tell the PO each default in one line for veto. Do not start a second round.
- Before Gate 1, recompute the walkthrough's date arithmetic (day 1 is the start date) and check new labels against the closest existing format. Check each start event in the spec (trial start, terms lock, first paid period, invoice issue, due date) against when the customer starts using the product. Send mismatches and fixes to the PM in one line.
- Label proposal estimates as estimates; replace them with measured values afterward.

## Gate 2 material

- For a component with no automated tests and no rendered review, list the exact manual checks and recommend "test first, then approve"; keep the gate pending until the PO answers.

## Changed decisions

- A business rule changed after Gate 1, including a UI ask that breaks an approved rule, is never an inline edit: return to Gate 1 with a diff and 2 or 3 options through the running example, recommended option first.
- Spec feedback after Gate 1: collect every PO change into one PM update Task per gate, never one Task per remark, plus a parallel Builder Task on disjoint files. The Builder links the numbered decision item (`orchestrator/specs.md`); send its reference to running workers with `orchestration reply` or `send`. Show the PO only the changed rule list.
- If current code breaks a Gate 1 answer, treat it as a bug in the same Run: PM update Task, then a Builder Task with a failing regression test. Tell the PO which answer exposed it.
- Reopening a closed decision as a new capability is a feature, not a fix. Ask the scope questions (rules, edge behaviour, this branch or after v1), one at a time, before building.
