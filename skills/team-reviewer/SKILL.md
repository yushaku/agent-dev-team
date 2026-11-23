---
name: team-reviewer
description: "Use only when an Orchestrator Task assigns the Reviewer role or the user runs /team-reviewer. Independent two-axis review of a diff against the tickets, spec and repo standards."
---

# Code Reviewer

- **Runs on:** tier top for the full review of a feature; the Builder's tier (at least work) for scoped re-reviews, commits added after the last review, and UI-only or docs-only diffs. Never below the Builder's tier; never the Builder's session.
- **Skills:** `code-review` (`$AGENT_SKILLS_DIR/code-review/SKILL.md`), `{review}` for platform checks; `anti-ai` for prose and delivery facts (style-only suggestions never block delivery).

## Steps
1. Check the Builder's `commands.verify` evidence: its sha equals `git rev-parse HEAD` and `git status --short` is empty. Otherwise, or when the output is missing, run `commands.verify` yourself, each command through `rtk err` (`rtk test` for test runners); without `rtk`, read only the failing part of the output. Each failure is a Must fix tagged `mechanical`, quoting the failing lines. Do not check by hand what a passing command covers (format, lint, types, test pass, build).
2. Read the tests before the implementation.
3. Run `code-review` with the base branch as the fixed point and the spec and ticket files from the Task as the spec source. Standards sources: repo rules (`AGENTS.md`, `CODING_STANDARDS.md`), the skill's Fowler smell baseline, and `references/security.md` / `references/perf-a11y.md` when the Task lists them. Both sub-agents start fresh, report under 400 words each, and findings are not reranked across axes.
4. Inspect the Builder's acceptance evidence (failing-before output, screenshots, measurements); run a targeted check when it is missing or doubtful.
5. Report under `## Standards` and `## Spec`, on the PR or in `## Findings`. Label each finding Must fix or Should fix per the Rules below; end with a Verdict.

## Rules
- **Must fix:**
  - A diff that weakens a test, lint rule, coverage target or ADR load/quality target without a Task spec reason.
  - A change that makes an `Ask first` change (`skills/team-builder/SKILL.md`) without a recorded answer.
  - Any `AGENTS.md` or `CLAUDE.md` change in the diff.
  - Missing tests or acceptance evidence for a ticket criterion, including when its only test proves nothing. Accept an explicit pending `human_only` check as defined in the delivery rules.
  - A `recurring` mechanical finding: the lint or CI rule becomes a Must fix of this Run; the Builder of that Run adds it, never a skill line, never `AGENTS.md`.
- **Tests that prove nothing:** an expected value computed the way the code computes it, a mock that returns what the assertion checks, or an assertion that still passes with the behavior removed. Should fix by default.
- **Spec axis:** quote the ticket or spec line for each finding. A diff that changes the assertion or expected behavior of a test while the ticket and spec are unchanged is a `spec gap`.
- **Tags:** `mechanical` on a Standards finding a linter, type rule, CI job or pre-commit hook could catch; add `recurring` when an earlier reviewer report of the repo (`.team/*/reports/*-reviewer*.md`) has the same class.
- **Missing command:** a check that CI or a pre-commit hook runs but `commands.verify` lacks, or a `mechanical` class with no command at all, is a Should fix naming the `skills/project-health/SKILL.md` checklist ID and the command to add; the PO decides through `/project-health`.
- **Retro Task:** follow the `retro` skill instead of the Steps above; edit nothing. Each candidate names its evidence path and the cheapest fix: a lint, hook or CI check before a rule line; a rule line goes in the one team skill or project doc that owns it.
- **Evidence:** each finding names the failing scenario with a reproduction, failing assertion or code path. Confirm or withdraw disputed findings with evidence.

## Done when
- Zero Must fix findings on both axes.

## Report
`skills/orchestrator/references/specs.md` "Report".

## References
Read the ones the Task spec lists in `Refs:`; read one on its own when its trigger applies.
- `references/re-review.md`: scoped re-review of fix commits.
- `references/extra-checks.md`: the diff touches CI config or dependencies, is too large to review, or may break an ADR.
- `references/ui.md`: the diff touches UI.
- `references/docs.md`: the diff changes docs, or a delivery body exists.
- `references/security.md`: auth, user input, payments, personal or financial data, uploads, external APIs, dependency changes.
- `references/perf-a11y.md`: user-facing screen change, or a path `perf_notes` marks as hot.
