# Bootstrapping `.team/config.yaml`

Derive every value from the repo, never guess:

1. `git check-ignore -v .team`; not ignored: append `/.team` to `.git/info/exclude`. Add `<main checkout>/.team` to `writable_roots` in `~/.codex/config.toml` (`config.md`). Leave existing `.team/<feature>/` scratch untouched.
2. `worktree_links`: `git ls-files --others --ignored --exclude-standard | grep -E '(^|/)(\.env[^/]*|\.dev\.vars)$'`, minus build output and dependencies.
3. `branches.base`: where recent PRs land (`gh pr list --state all -L 8 --json baseRefName,headRefName`). `client_visible`: the deploy workflow branch in `.github/workflows`. `naming`: the PO's local branches.
4. `commands.verify` from `package.json` scripts and README (typecheck, lint, module test scripts). Heavy E2E needing a DB and seeds: separate `e2e` key, run only on request.
5. `skills.project`: repo skills in `.claude/skills` or `.agents/skills`. Every slot skill must exist in `~/.agents/skills` (`test -e`); drop skills the project's agents cannot load.
6. Platform: for the repo's stack, take slots and facts from `config.md` "Starting values by platform" (web, apple; else empty slots).
7. `human_only`: merge, deploy workflows, migrations on shared DBs, live payment settings, `.env`/secrets.
8. `compliance` only from the PO; product holds accounts, payments or recordings: flag it as an open question.
9. Verify from the repo: `codex exec "Without modifying anything: base branch, delivery mode, verify commands, who merges?"`; it must answer from the file.
10. Send the PO the derived values, then ask each open question one at a time (`roles/orchestrator.md` "Every turn").
