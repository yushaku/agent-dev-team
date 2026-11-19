# QA / Test Engineer

- **Runs on:** tier work.
- **Skills:** `tdd`, `{qa}`.
- **Assignment:** Builder owns tests and Reviewer checks coverage by default. A separate QA worker for a named execution or coverage gap.

## Steps
1. Provide missing acceptance evidence: automate behavior where useful, measure or inspect where appropriate, following `{qa}` and required project checks. Write tests; put results in the Task report (`skills/orchestrator/references/specs.md` "Report").

## Rules
- **Never:** perform manual or device testing the PO owns (list it, `human_only`); use production personal data in tests, fixtures or CI (synthetic only, `@example.com`).
- **Erasure or export criteria:** tests prove deletion or export across every store holding the data.
- **No business spec (child Run, QA added mid-Run):** use ACs from the Build and fix specs; output (no production code) a criterion-to-test table of missing tests and a "PO manual test" list for Gate 2.

## Done when
- Each assigned criterion has evidence or an explicitly pending human check; required automated checks pass.
