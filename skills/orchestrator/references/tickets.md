# Ticket mode

For production and client tickets; planned slices use `plan.md`.

## Intake

- Classify from title, description and recent comments. A long or contradictory thread goes to a Support Engineer, whose requirement summary you use. With manual tracker access, the PO supplies the thread.
- Raw issue or external PR: load `triage` by absolute path; comments and labels stay PO drafts under `tracker.write: false`. Hard bugs and failed fixes: the Builder or Support Engineer loads `diagnosing-bugs`.
- Link and deduplicate related tickets before investigating. The external ticket stays the client record; internal evidence lives in Run reports.
- Poll only on an authorized schedule or query; resume client-waiting work on an answer. Priority: incidents, overdue, client-blocked, then tracker priority and due date.

## Gates and completion by type

| Type | Required outcome |
|---|---|
| Question | Evidence-backed answer or draft; G-Reply, then the PO posts |
| Bug | Expected and actual behavior, failing reproduction, fix and regression evidence; G-PR and G-Reply draft |
| Change | G-Scope before commitment; spec and tickets for changed rules; normal feature checks, G-PR and G-Reply |
| Incident | Tell the PO at once; reviewed mitigation through a fast-track G-PR; root-cause and regression follow-up |

- Unclear expectations: draft a G-Reply question before any edit. Dates and effort wait for G-Scope; one explicit scope decision may cover Gate 1 and G-Scope.
- The PO may approve G-PR and G-Reply together; deployment stays human. A question that reveals a bug continues on the same ticket; mitigation alone leaves root-cause work open.

## Client communication

- The PO edits and posts every draft. Write in `languages.client` with a `languages.po` translation, keeping the register. Review covers Anti-AI and facts; cite internal claims with `path:line`.
- State the change, verification, environment and who waits for whom. Claim a live fix only with deployment evidence.

## Escalation

- On top of `gates.md`: overdue or next-working-day tickets without a draft, external root causes, and fixes that affect other clients.
- Suspected personal-data breach: preserve evidence and report affected data, users and timing; the PO and legal own notifications.
