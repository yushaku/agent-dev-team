---
name: project-health
description: "Use when the user runs /project-health, after /init-team, or when a Reviewer reports a missing verify command. Audits a repo's mechanical checks against the checklist below and proposes the gaps to fill."
---

# Project health

A command: the PO runs it in the repo's main checkout. Read-only on code and config; writes only `.team/health.md`. Config changes need the PO's go; missing tooling becomes a Builder Task.

## Checklist

What `commands.verify` must or should run. Each item passes when a command does it, the command is in `commands.verify`, and CI runs it on the base branch.

**Must** (every repo with code):

| ID | Check | Passes when |
|---|---|---|
| M1 | Format | Formatter in check mode fails on any unformatted file. |
| M2 | Lint | Linter fails on any error. |
| M3 | Types | Typechecker in strict mode, for typed languages. |
| M4 | Tests | Unit tests run headless and exit non-zero on failure. |
| M5 | Build | Production build, the way CI builds it. |
| M6 | Secrets | Secret scan (gitleaks or equivalent) over changed files. Never switched off. |
| M7 | Loosening | Fails on a new `eslint-disable`, `ts-ignore`/`ts-nocheck`/`ts-expect-error`, focused or skipped test, `\|\| true` in scripts or CI, `--no-verify`, TLS verification off. Prefer linter rules (`@typescript-eslint/ban-ts-comment`, `eslint-comments/no-unlimited-disable`, test-plugin no-focused/no-disabled) over a script. Allowed exceptions live in one policy file naming file, marker and reason. |
| M8 | Parity | `commands.verify` covers every check CI runs; hooks run a fast subset of the same commands. |

**Should** (when the repo has the thing):

| ID | Check | Passes when |
|---|---|---|
| S1 | Dependency audit | Advisories at high or above fail. |
| S2 | Migrations | Migrations applied to an empty database build the schema the code expects. |
| S3 | Boot | The app starts and answers a health route, or its DI container composes. |
| S4 | Dead code | Unused files, exports and dependencies fail (knip or equivalent). |
| S5 | Spec IDs | `skills/team-tech-lead/references/spec-id-check.md`, when `docs/product/` exists. |
| S6 | Coverage floor | Changed files meet a floor the PO set. |

Not adopted: a Sonar zero-issue gate and 100% coverage per file (cost against benefit, `research/starci-harness-gates.md`).

**Every command:** non-interactive, check mode (never writes files), non-zero exit on failure, at most 300 s on a dev machine. A slower one moves to CI only or to `e2e`, with the PO's go.

## Steps

1. Read `.team/config.yaml` (`commands`), package scripts or Makefile, CI workflows, hook config (husky, lefthook, pre-commit) and tool configs.
2. For each item: `present`, `partial`, `missing` or `n/a` (with reason); the command; whether it is in `commands.verify`, CI and hooks.
3. Run `commands.verify` in a fresh worktree at `branches.base`, each command through `rtk err` (`rtk test` for test runners); record pass or fail and wall time per command, then remove the worktree. A red base is the first finding.
4. Count existing loosening markers per kind, so M7 can start from a baseline instead of failing on old code.
5. Write `.team/health.md`: the table, the base run, then proposals in order (Must before Should): config-only changes (a command exists but is not in `commands.verify`), then tooling to add. Each names the exact command, files touched and expected run time.
6. Report to the PO: Must gaps, base run result, and the first proposal as a question (recommended answer first).

## Rules

- Never lower or remove a check, never edit code or `.team/config.yaml` before the PO's go.
- Tooling goes to one Builder Task per repo through `/orchestrator`, Must items first.
