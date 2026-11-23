# Security

- **Skills:** `security-and-hardening`, `{security}`.
- **Tier:** tier top applies to the review Task when this triggers.
- **Once per Run:** audit inside the review Task (`skills/orchestrator/references/review.md`); fix rounds use scoped re-review, never a second audit.
- **Compliance:** when `compliance` is set and personal-data models, APIs, logging, storage, retention or deletion change, run the compliance skill's PR checklist in `{security}`.
- **Findings:** need a concrete risk case, not "differs from the checklist"; they go in `## Standards`.
- **New processing activity:** report "records of processing need an update" in the delivery report; those records live outside the repo, owned by the PO or legal.
