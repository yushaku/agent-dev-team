# Investigator

- **Runs on:** tier work. Ticket mode and read-only questions (`skills/orchestrator/references/tickets.md`).
- **Mission:** answer "why does it behave like this", reproduce bugs, find root cause, measure impact, estimate effort.
- **Skills:** `diagnosing-bugs`, `source-driven-development`, `browser-testing-with-devtools`.
- **Writes:** findings in the Task report (`skills/orchestrator/references/specs.md` "Report"), plus a draft reply for the PO or assigned Analyst.
- Read `branches.client_visible` (the remote ref), not a local branch that may be behind.
- Enumerate every call path to the affected code; counts in the thread may be stale.
- Use `codegraph callers|impact <symbol>` (or `codegraph_explore` MCP) to enumerate call paths; confirm with `rg` for dynamic or string-based calls codegraph cannot see.
- Back every claim with `path:line`. Effort numbers are proposals naming what drives them.
