# Workflow

```
Idea ─▶ Orchestrator (load config + profile, size) ─▶ PM writes/updates business spec
                   │
             [GATE 1: PO approves business spec]
                   │
        ┌──────────┴──────────┐
     Designer             Tech Lead
  (flow, 2-3 options)  (ADR if needed, plan)
        │                     │
  [G-UI: PO picks one]        │
        └──────────┬──────────┘
                   │
        Build: one Builder, vertical slices in order
        (fast check per slice, full verify once)
                   │
        Verify: see `orchestrator/review.md` "Verification and fix rounds"
                ║ QA ║ Perf/A11y*
                   │
        Fix loop (max 2 rounds, scoped re-review each) ── fail ─▶ escalate to PO
                   │
        Delivery Engineer (draft PR or committed branch)
                   │
             [GATE 2: PO reviews the delivery]
                   │
        Orchestrator closes Run
```
`*` only when triggered.

## Task DAG (Feature mode, S3)

```
pm-spec ─▶ [gate-1] ─┬─▶ ux-flow ─▶ ux-options ─▶ [g-ui] ─┐
                     └─▶ plan (2-4 vertical slices) ──────┴─▶ build (all slices)
                                                                   │
                                  verify ║ review-spec ║ qa ║ perf-a11y*
                                                                   │
                                     deliver (anti-ai on text) ─▶ [gate-2]
```

## Other DAG shapes

- **Small change (S1):** `build -> verify (anti-ai, review) -> deliver -> [gate-2]`
- **Business rule change (S2):** `pm-spec -> [gate-1] -> qa-tests -> build -> verify -> deliver -> [gate-2]`
- **New screen or flow (S2):** `ux-flow -> ux-options -> [g-ui] -> build -> (verify || qa || perf-a11y*) -> deliver -> [gate-2]`
- Maintenance shapes: `maintenance.md`.
- One Build Task per feature; parallel Build Tasks only for disjoint slices when `flow.max_concurrent_agents` > 1.
- `verify` and `review-spec`: `orchestrator/review.md` "Verification and fix rounds".
- Keep verification waves parallel; no dependency chain deeper than 3 or 4 Tasks.
- Overlap head and tail: PM tidy (`roles/pm.md`) starts beside Designer and Tech Lead after Gate 1; the Delivery body (no commits) runs beside the last scoped re-review.

## Definition of Done (feature)

- Every acceptance criterion in the business spec maps to a passing test.
- Zero Must fix findings; triggered audits: zero high-severity findings.
- No AI tells left in code, comments, docs, commits or delivery text.
- `commands.verify` green.
- A feature calling an external service (push, mail, payments): one real end-to-end call on a production preview, its evidence in the delivery; mocked tests do not count.
- UI changes: screenshots in the delivery only when the visual loop ran; otherwise "UI check: PO" under Human steps.
- Delivered per `delivery.mode` with the body in `roles/delivery.md`.
- CHANGELOG line in the change; human docs regenerated if a source changed; scratch deleted at close.
- PO approved the delivery at Gate 2.

## Escalation

Ping the PO immediately when:
- A task fails its fix loop twice.
- Two roles disagree and no ADR settles it.
- Code and business spec disagree (`docs-policy.md`).
- Scope must change versus the approved spec.
- A security finding is high severity.
- A personal data breach is suspected, in any flow: report at once with what is known; the legal deadline is the PO's (GDPR: 72 hours to the authority).
- A worker is blocked for more than a few minutes (`roles/orchestrator.md` "Every turn").
- Any action is irreversible: force-pushing shared branches, migrations against real data, deleting branches or data, spending money.
