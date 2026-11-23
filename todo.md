# Todo

- [ ] **Codegraph nudge hook (trial, review 2026-11-26)**
  **Goal:** agents look up code symbols with codegraph instead of `rg`/`grep` in indexed repos, via the `bin/cg_nudge.py` PostToolUse hook.
  **Outcome:** codegraph share of search calls above 50% for Builder and Investigator on the dashboard; otherwise block symbol `rg` or drop the rule.
  Ref: .team/research/codegraph-nudge.md
