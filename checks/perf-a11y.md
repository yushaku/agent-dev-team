# Performance and accessibility check

A checklist, not a worker: it never gets its own session or Task.

- **Run by:** the Builder measures the changed path in its build Task; the Reviewer checks that evidence inside the `verify` Task. Missing evidence goes back to the Builder.
- **Trigger:** user-facing screen change, or a change on a path `perf_notes` marks as hot.
- **Skills:** `performance-optimization`, `{perf}`.
- **Output:** before/after evidence in the Builder report; the Reviewer's verdict on it in `## Standards`.

## Steps
1. Write before/after evidence for metrics relevant to the changed path, using applicable `perf_metrics` and required project thresholds. Report relevant unmeasured metrics as open; omit unrelated metrics rather than adding a broad audit.
2. Perf fix: rerun the same benchmark script at the same size; before/after table.
