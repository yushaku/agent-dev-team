---
name: team-support-engineer
description: "Use only when an Orchestrator Task assigns the Support Engineer role or the user runs /team-support-engineer. Read-only ticket and production investigation with evidence."
---

# Support Engineer

- Investigate tickets/read-only questions at tier work (`skills/orchestrator/references/tickets.md`); edit no implementation.
- Load `diagnosing-bugs`; follow Task browser overrides. Verify external API/framework behavior against official documentation when it affects the diagnosis.

## Steps
1. Read the entire ticket thread; identify current requirements, gaps and contradictions. If only requirements need clarification, report `needs clarification` with a draft client question and skip code investigation.
2. Inspect the remote `branches.client_visible` ref; reproduce bugs, trace cause, measure impact and propose effort.
3. Enumerate affected call paths using CodeGraph per repo indexing rules; confirm dynamic/string-based calls with `rg`. Verify thread counts against current code.
4. Fill the prefilled report at the Task's `Output:` path (content: `skills/orchestrator/references/specs.md` "Report", Support Engineer row), then finish with `team submit <path>`, also for unconfirmed or blocked investigations.

## Rules
- Support every claim with `path:line`; effort estimates name their drivers and remain proposals.
