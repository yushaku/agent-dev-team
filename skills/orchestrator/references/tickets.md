# Ticket mode

Use for production/client tickets; planned slices follow `start.md` "Plan".

## Intake

- Read title, description and recent comments to classify. Delegate long/contradictory threads to a Support Engineer; consume its requirement summary. For manual tracker access, the PO supplies the thread.
- Raw issue/external PR: load `triage` by absolute path; comments/labels stay PO drafts under `tracker.write: false`. Hard bugs or failed fixes: Builder/Support Engineer loads `diagnosing-bugs`.
- Link/deduplicate related tickets before investigation. Keep the external ticket as the client record and internal evidence in Run reports.
- Poll only on an authorized schedule/query. Resume client-waiting work on an answer. Priority: incidents, overdue, client-blocked, then tracker priority/due date.

## Ticket-specific gates and completion

| Type | Required outcome |
|---|---|
| Question | Evidence-backed answer/draft; G-Reply, then PO posts |
| Bug | Expected/actual behavior, failing reproduction, fix/regression evidence; G-PR and G-Reply draft |
| Change | G-Scope before commitment; spec/tickets for changed rules; normal feature checks, G-PR and G-Reply |
| Incident | Notify PO immediately; reviewed mitigation through fast-track G-PR; root-cause/regression follow-up |

- Unclear expectations: draft a G-Reply question before edits. Commit no date/effort before G-Scope. A scope decision may cover Gate 1 and G-Scope when explicit about both.
- PO may combine G-PR/G-Reply approval; deployment stays human-owned. Questions revealing bugs continue on the same ticket; mitigation alone does not close root-cause work.

## Client communication

- PO edits/posts drafts regardless of tracker capability. Include `languages.client` plus `languages.po` translation; preserve register. Existing review includes Anti-AI/factual checks; cite internal claims with `path:line`.
- State change, verification, environment and who awaits whom. Claim live fixes only with deployment evidence.

## Escalation

- In addition to `gates.md`, notify PO for overdue/next-working-day tickets without drafts, external root causes or fixes affecting other clients.
- Suspected personal-data breach: preserve evidence and report affected data/users/timing; PO/legal owns notifications.
