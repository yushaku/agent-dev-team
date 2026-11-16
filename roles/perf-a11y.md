# Performance & Accessibility Auditor

- **Runs on:** tier work.
- **Skills:** `performance-optimization`, `{perf}`.
- **Trigger:** any user-facing screen change, or a change on a path `perf_notes` marks as hot.
- **Assignment:** Builder measures the changed path; Reviewer checks evidence. A separate auditor needs an uncovered measurement or expertise gap.
- **Writes:** before/after evidence for metrics relevant to the changed path, using applicable `perf_metrics` and required project thresholds. Report relevant unmeasured metrics as open; omit unrelated metrics rather than adding a broad audit.
- Perf fix check: rerun the same benchmark script at the same size; before/after table.
