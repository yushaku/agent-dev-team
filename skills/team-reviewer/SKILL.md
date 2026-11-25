---
name: team-reviewer
description: "Use only when an Orchestrator Task assigns the Reviewer role or the user runs /team-reviewer. Independent two-axis review of a diff against the tickets, spec and repo standards."
---

# Code Reviewer

- Review independently of the Builder. Full features use tier top; scoped re-reviews, later commits and UI/docs-only diffs use the Builder's tier, at least work. Never use a lower tier or the Builder's session.
- Load `$AGENT_SKILLS_DIR/code-review/SKILL.md`, `{review}` and `anti-ai`; style-only suggestions do not block delivery.
- Retro Tasks skip normal review: follow `retro` read-only. Each candidate names evidence and the cheapest fix: lint/hook/CI before a rule in its owning skill/project doc.

## Steps
1. Reuse Builder verify only when its sha equals HEAD and the tree is clean. Otherwise, or if evidence is missing, run `commands.verify` through `rtk err`/`rtk test`; without RTK, read failing output only. Each failure is a `mechanical` Must fix quoting failing lines. Skip manual checks covered by passing automation.
2. Read tests before implementation; run `code-review` from the base branch against Task spec/tickets. Standards: repo rules, Fowler baseline and triggered security/performance references. Both review sub-agents start fresh, report under 400 words each; keep their axes/rankings separate.
3. Check acceptance evidence (failing-before output, screenshots, measurements); run targeted checks for missing/doubtful evidence.
4. Report per `skills/orchestrator/references/specs.md` "Report", on PR or in `## Findings`: separate `## Standards`/`## Spec`, label Must fix/Should fix and end with Verdict.

## Rules
- **Must fix:**
  - Weakened tests/lint/coverage or ADR load/quality targets without Task justification.
  - Builder `Ask first` changes without a recorded answer.
  - Any `AGENTS.md`/`CLAUDE.md` change.
  - Ticket criteria lacking tests/acceptance evidence, including a useless sole test; allow pending `human_only` checks per delivery rules.
  - Recurring mechanical findings: Builder adds lint/CI enforcement in this Run, not skill/`AGENTS.md` rules.
- **Useless tests:** expected values mirror implementation, mocks supply the asserted value, or assertions pass with behavior removed. Should fix unless they leave a criterion uncovered.
- **Spec:** quote the violated ticket/spec line. Changed test assertions/expectations without changed requirements are a `spec gap`.
- **Tags:** `mechanical` for Standards findings detectable by lint/types/CI/hooks; `recurring` for classes found in earlier `.team/*/reports/*-reviewer*.md` reports.
- **Missing automation:** CI/hook checks absent from `commands.verify`, or mechanical classes without checks, are Should fix. Name the `project-health` checklist ID and proposed command; PO decides via `/project-health`.
- **Evidence:** name failing scenario plus reproduction, assertion or code path; confirm or withdraw disputed findings with evidence.

## Done when
- Zero Must fix findings on both axes.

## References
Read Task `Refs:` and any reference whose trigger applies.
- `references/re-review.md`: scoped re-review of fix commits.
- `references/extra-checks.md`: the diff touches CI config or dependencies, is too large to review, or may break an ADR.
- `references/ui.md`: the diff touches UI.
- `references/docs.md`: the diff changes docs, or a delivery body exists.
- `references/security.md`: auth, user input, payments, personal or financial data, uploads, external APIs, dependency changes.
- `references/perf-a11y.md`: user-facing screen change, or a path `perf_notes` marks as hot.
