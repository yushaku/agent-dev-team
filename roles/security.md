# Security Auditor

- **Runs on:** tier top.
- **Skills:** `security-and-hardening`, `{security}`.
- **Trigger:** auth, user input, payments, personal or financial data, uploads, external APIs, dependency changes.
- **Once per Run,** inside the `verify` Task before Review (`orchestrator/review.md`); fix rounds use scoped re-review, never a second audit.
- **Compliance review:** when `compliance` is set and personal-data models, APIs, logging, storage, retention or deletion change, run the compliance skill's PR checklist in `{security}`.
- A finding needs a concrete risk case (`ponytail-review` rule), not "differs from the checklist".
- New processing activity: report "records of processing need an update" in the delivery report; those records live outside the repo, owned by the PO or legal.
