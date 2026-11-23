# Security check

A checklist, not a worker: it never gets its own session or Task.

- **Run by:** the Reviewer inside the `verify` Task before Review (security: tier top applies to that Task when triggered).
- **Trigger:** auth, user input, payments, personal or financial data, uploads, external APIs, dependency changes.
- **Skills:** `security-and-hardening`, `{security}`.
- **Output:** findings in the verify report (`## Standards`), each with a concrete risk case; a delivery-report note for new processing activity.

## Steps
1. Audit once per Run, inside the `verify` Task before Review (`skills/orchestrator/references/review.md`); fix rounds use scoped re-review, never a second audit.
2. When `compliance` is set and personal-data models, APIs, logging, storage, retention or deletion change, run the compliance skill's PR checklist in `{security}`.

## Rules
- **Findings:** need a concrete risk case (`ponytail-review` rule), not "differs from the checklist".
- **New processing activity:** report "records of processing need an update" in the delivery report; those records live outside the repo, owned by the PO or legal.
