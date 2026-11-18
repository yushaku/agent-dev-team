---
name: init-team
description: "Use when the user runs /init-team or a repo has no .team/config.yaml. Reads the repo, interviews the PO one question at a time, writes the config."
---

# Init team config

Creates or updates `.team/config.yaml` in the main checkout. Schema and defaults: `$AGENT_TEAM_HOME/config.md` (default `~/.agents/teams`); read it first.

## 1. Read the repo (derive, never guess)

1. `git check-ignore -v .team`; not ignored: append `/.team` (no trailing slash) to `.git/info/exclude`; keep `AGENTS.md` and `.gitignore` unchanged. Observed permission failures: `skills/orchestrator/references/start.md` "Worker permissions". Leave existing `.team/<feature>/` scratch untouched.
2. `worktree_links`: `git ls-files --others --ignored --exclude-standard | grep -E '(^|/)(\.env[^/]*|\.dev\.vars)$'`, minus build output and dependencies.
3. `branches.base`: where recent PRs land (`gh pr list --state all -L 8 --json baseRefName,headRefName`). `client_visible`: the deploy workflow branch in `.github/workflows`. `naming`: the PO's local branches.
4. `commands.verify` from `package.json` scripts, Makefile and README (typecheck, lint, module tests). Heavy E2E needing a DB and seeds: `e2e`, run only on request. Shared build cache or device: `commands.serial: true`.
5. `skills.project`: repo skills in `.claude/skills` or `.agents/skills`.
5a. `codegraph`: `on` when `codegraph` is installed and the repo's main language is indexed (`codegraph init` succeeds); run `${AGENT_TEAM_HOME:-~/.agents/teams}/bin/cg-project .` in the main checkout. Show the PO the Orca repo Setup/Archive scripts from `config.md` "Code search" to paste in Orca repo settings (no CLI sets them).
6. Platform: slots and facts from `references/platforms.md` (web, apple; else empty slots). Every slot skill must exist in `~/.agents/skills` (`test -e`); list missing ones.
7. `human_only` candidates: merge, deploy workflows, migrations on shared DBs, live payment settings, `.env` and secrets.
8. Repo rules in `AGENTS.md` / `CLAUDE.md` win; map them, never contradict them.

## 2. Interview the PO

- Show the derived values first, grouped, each with its source (file or command).
- Then ask only what the repo cannot answer, one question at a time, options with the recommended one first (`interview-me`); next question after the answer. Typical: `languages.po` and `languages.client`, `delivery.mode` and `push`, `tracker`, `human_only`, `compliance` (product holds accounts, payments or recordings), `ui_rules.gate`, model catalog and tier preferences (below).
- **Models:** on every init/update, read existing `models` and confirm it remains intended. If absent, incomplete or legacy, ask which Orca agents/providers and exact model ids the PO wants to allow; then ask about tier assignment, fallback order and role overrides, one question per turn. Show supported ids/flags only from available read-only Orca/agent discovery; when model enumeration is unavailable, ask for ids without launching workers or assuming a provider from the agent name. Tier placement is the PO's decision, with the risk guidance in `config.md` as the recommendation. Confirm effort per entry, explicit disabled choices and whether omitted flags should use agent settings. Reuse an approved catalog supplied in this session; confirm only unresolved choices.
- Preview the complete `models.catalog`, `models.tiers` and `models.roles` together before writing. Validate tier coverage for the chosen workflow, alias/role references and agent-specific flag support. Never write placeholder model ids as a usable catalog or claim that discovery proves login/quota availability.
- Stop when every key is derived, answered or left at its default. Never ask about a default the PO has no reason to change.

## 3. Write

- Write only keys that differ from `config.md` defaults, plus `skills`, `commands.verify` and the complete approved `models` catalog/tier/role settings; one short comment where the value is not obvious.
- Existing config: show a per-key diff (added, changed); change existing values only after the PO agrees; drop a legacy `profile:` key after copying its starting values.
- Check it parses (`ruby -ryaml -e 'YAML.load_file(".team/config.yaml")'` or any YAML parser), never commit it.
- Verify with a fresh read-only agent session: "Without modifying anything, from `.team/config.yaml`: base branch, delivery mode, verify commands, who merges; which catalog alias/agent/model/effort handles a simple edit, an implementation and an independent review; what happens if that model is unavailable?"; it must answer from the file.
- Report: path, keys written, open items (missing skills, unanswered questions).
