# Todo

## Codegraph nudge hook (trial)

**Goal:** agents look up code symbols with codegraph instead of `rg`/`grep` in indexed repos.

**Why:** the rule is in global AGENTS.md / CLAUDE.md, `roles/builder.md`, `roles/investigator.md` and every Task spec, yet agents still use `rg` for symbols. TOHAKU-2429: the Builder confirmed `.codegraph/` exists, then ran `rg -n 'parseCartHeaderDiscount'`; the Reviewer had the MCP tool loaded and never called it. Prompt rules are forgotten; feedback at the moment of the call is not.

**Baseline (dashboard, 7 days to 2026-11-19, codegraph share of search calls, file reads excluded):** Codex 2% before the rule update, 19% after (3 sessions); Claude 0%; Hermes 0 to 1%.

**Mechanism:** `bin/cg_nudge.py`, a PostToolUse hook on Bash for Claude Code and Codex. When a shell `rg`/`grep` pattern is a code symbol (camelCase, PascalCase, snake_case, `function X`, `a|b` of symbols) and `.codegraph/` exists at or above the command's directory, it adds one line of context pointing to `codegraph explore` / `callers|impact`. Never blocks.

**Steps:**
- [x] Hook script with symbol detection, checked against real commands from TOHAKU-2429 sessions.
- [ ] Register it under `PostToolUse` (matcher `Bash`) in `~/.claude/settings.json` and `~/.codex/hooks.json` (waiting for PO approval to edit agent configs).
- [ ] Confirm it fires in one Claude and one Codex session (Codex `exec` code mode may not pass through the Bash hook).
- [ ] Dashboard: count symbol lookups via rg/grep (import `symbol_searches` from `bin/cg_nudge.py`) and add a "Vấn đề" check: symbol `rg` in an indexed repo.

**Review on 2026-11-26:**
- Codegraph share of search calls and symbol `rg` count per role, before vs after.
- Outcome: share above 50% for Builder and Investigator: keep the nudge. Little change: decide between blocking symbol `rg` in indexed repos and dropping the rule. If codegraph output is costing more tokens than `rg` + `sed`, drop the rule.
