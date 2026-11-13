---
name: init-team
description: "Use when the user runs /init-team or a repo has no .team/config.yaml. Reads the repo, interviews the PO one question at a time, writes the config."
---

# Init team config

Creates or updates `.team/config.yaml` in the main checkout. Schema, defaults and platform starting values: `$AGENT_TEAM_HOME/config.md` (default `~/.agents/teams`); read it first.

## 1. Read the repo (derive, never guess)

1. `git check-ignore -v .team`; not ignored: append `/.team` to `.git/info/exclude`. Codex enabled: add `<main checkout>/.team` to `writable_roots` in `~/.codex/config.toml`. Leave existing `.team/<feature>/` scratch untouched.
2. `worktree_links`: `git ls-files --others --ignored --exclude-standard | grep -E '(^|/)(\.env[^/]*|\.dev\.vars)$'`, minus build output and dependencies.
3. `branches.base`: where recent PRs land (`gh pr list --state all -L 8 --json baseRefName,headRefName`). `client_visible`: the deploy workflow branch in `.github/workflows`. `naming`: the PO's local branches.
4. `commands.verify` from `package.json` scripts, Makefile and README (typecheck, lint, module tests). Heavy E2E needing a DB and seeds: `e2e`, run only on request. Shared build cache or device: `commands.serial: true`.
5. `skills.project`: repo skills in `.claude/skills` or `.agents/skills`.
6. Platform: slots and facts from `config.md` "Starting values by platform" (web, apple; else empty slots). Every slot skill must exist in `~/.agents/skills` (`test -e`); list missing ones.
7. `human_only` candidates: merge, deploy workflows, migrations on shared DBs, live payment settings, `.env` and secrets.
8. Repo rules in `AGENTS.md` / `CLAUDE.md` win; map them, never contradict them.

## 2. Interview the PO

- Show the derived values first, grouped, each with its source (file or command).
- Then ask only what the repo cannot answer, one question at a time, options with the recommended one first (`interview-me`); next question after the answer. Typical: `languages.po` and `languages.client`, `delivery.mode` and `push`, `tracker`, `human_only`, `compliance` (product holds accounts, payments or recordings), `ui_rules.gate`, agents to switch off (`models.agents`).
- Stop when every key is derived, answered or left at its default. Never ask about a default the PO has no reason to change.

## 3. Write

- Write only keys that differ from `config.md` defaults, plus `skills` and `commands.verify`; one short comment where the value is not obvious.
- Existing config: show a per-key diff (added, changed); change existing values only after the PO agrees; drop a legacy `profile:` key after copying its starting values.
- Check it parses (`ruby -ryaml -e 'YAML.load_file(".team/config.yaml")'` or any YAML parser), never commit it.
- Verify with a fresh read-only agent session: "Without modifying anything, from `.team/config.yaml`: base branch, delivery mode, verify commands, who merges?"; it must answer from the file.
- Report: path, keys written, open items (missing skills, unanswered questions).
