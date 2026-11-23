# Ticket mode

Use `start.md` for team selection; add a Support Engineer only for a named gap existing workers cannot cover.

## Intake

- Read only the title, description and the last few comments: enough to classify the type below and pick the team. A long or contradictory thread goes to a Support Engineer (`roles/support.md` step 1); use its requirement summary, never the full thread, in the Orchestrator context. Manual access: the PO supplies the thread.
- Link related tickets and deduplicate before investigating. The ticket remains the external record; keep internal evidence in the Run reports.
- Poll only on an authorized schedule using the configured query. Waiting for the client is a waiting status; resume when an answer arrives.
- Prioritize incidents, overdue tickets, client-blocked work, then tracker priority and due date.

## Ticket-specific gates and completion

| Type | Required outcome |
|---|---|
| Question | Evidence-backed answer and draft; G-Reply, then the PO posts it |
| Bug | Confirm expected vs actual behavior; failing reproduction then fix and regression evidence; G-PR; draft fix report for G-Reply |
| Change request | G-Scope approves scope and estimate before work; update business spec when rules change; normal feature checks and G-PR; report through G-Reply |
| Incident | Notify PO immediately; reviewed mitigation through fast-track G-PR; record follow-up root-cause/regression work |

- Unclear expected behavior: draft a question for G-Reply before changing it. Never promise dates or effort before G-Scope.
- Gate 1 covers changed business rules; G-Scope covers the ticket scope/estimate. One PO decision may satisfy both when it explicitly covers both.
- Fast-track: the PO may approve G-PR and G-Reply together. Deployment remains human-owned.
- A question revealing a bug continues as bug work on the same ticket. A mitigation does not close unresolved root-cause work.

## Client communication

- Agents prepare drafts; the PO edits and posts them, regardless of tracker write capability. Include `languages.client` plus a `languages.po` translation.
- Include Anti-AI and factual checks in the existing review. Preserve client register; cite internal claims with `path:line` (optional in external drafts).
- State what changed, how to verify, environment, and who is waiting for whom. A fix report is ready after review; do not claim the fix is live before deployment evidence.

## Escalation

In addition to `gates.md`, notify the PO for overdue/next-working-day tickets without a draft, a root cause in another party's system, or a fix affecting other clients' expected behavior.

A suspected personal-data breach follows incident handling: preserve evidence and report affected data/users and timing. Notifications to users or authorities are the PO/legal team's decision under `compliance`.
