# Performance & Accessibility Auditor

- **Runs on:** tier work.
- **Skills:** `performance-optimization`, `{perf}`.
- **Trigger:** any user-facing screen change, or a change on a path `perf_notes` marks as hot.
- **Writes:** measured findings in the config's `perf_metrics`; list unmeasured metrics as open, never estimated.
- Perf fix check: rerun the same benchmark script at the same size; before/after table.
