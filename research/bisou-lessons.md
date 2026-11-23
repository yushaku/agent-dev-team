# Lessons from bisou (November 2026)

Evidence: `~/orca/projects/bisou` at 2026-11-23 (main, `.team/journal-comments/`), the team dashboard 7-day data and this repo's git log. Each lesson names the Matt Pocock practice that answers it.

## Running the team

1. **The process changed more than it ran.** 111 commits to this repo in 10 days, roles restructured 4 times in 4 days, about 10 real Runs since 11-16. Answer: change a skill only for an observed failure in a real session (Matt `SCOPE.md` bar), found through `retro`.
2. **UX was decided after the build.** journal-comments: Gate 1 chose "no G-UI round", the PO found the UI poor at Gate 2, 3 fix rounds followed (target 1). The three fixes (Facebook bubbles, hidden edit/delete, pinned input) were answerable in words. Answer: grill asks the UI questions before tickets; `prototype` only when the answer must be seen.
3. **A fresh-context reviewer catches real bugs.** journal-comments review found a lost-comment race, a wrong delete confirmation, stale pull-to-refresh data and an overwritten count. Whether a different agent added anything beyond a clean context is unverified. Answer: `code-review` with fresh sub-agents.
4. **Metrics read from tool state were wrong.** 0 of 25 Orca Runs showed delivered or merged; the dashboard reported 1 fix round where the reports show 3. Answer: count from artifacts (`reports/*-builder-r*`, PO findings, tokens).
5. **Coordination cost rivalled the work.** Orchestrator plus direct chat about 386M tokens against about 525M for workers; 67% of tokens were unattributed. Answer: the human drives phases; subagents start fresh and talk through context pointers.
6. **Tooling grew into its own project.** The dashboard took 307 file edits since 11-13. Answer: no tool without a decision it changes.
7. **One agent is a single point of failure.** A Run fell back entirely to Codex ("claude not logged in"); Codex quota once hit 100%. Keep the flow harness-agnostic (Matt skills run on both).

## Docs

1. **Feature specs kept as permanent docs pile up.** 18 `docs/product/` files, about 28k words, 400 rules, 270 acceptance criteria, a `Retired:` list in 17 of them. Answer: specs and tickets live in the tracker and close with the work; only `GLOSSARY.md` and ADRs stay.
2. **Tests named by spec IDs lock the docs in place.** 392 test names in 63 files cite `R`/`AC` IDs, so the specs cannot be deleted without renaming tests. Answer: name tests by behaviour; tests are the living spec.
3. **ADRs with implementation detail go stale.** ADRs cite migration numbers, column names and spec rule IDs; ADR 0007 is 1,960 words. ADR 0009 keeps an outdated title and body, an override note at its foot and a partial replacement in ADR 0012: three places to read for one truth. Answer: an ADR is 1 to 3 sentences of context, decision and why, written only when hard to reverse, surprising and a real trade-off; a change is a new ADR marked `superseded by`.
4. **Hand-kept indexes drift.** `docs/README.md` misses journal-comments and ADRs 0013 to 0016 and links a `CHANGELOG.md` that does not exist. Answer: point at folders, not lists.
5. **"Read-only legacy, code wins" still misleads.** `architecture.md` describes day one ("planned" routes). Answer: delete docs the code has overtaken; history lives in git.
6. **One decision in two places drifts.** `todo.md` "Decisions" restates ADRs 0001 and 0002. Answer: a single source of truth per meaning.
7. **Always-loaded files carry blurbs.** `AGENTS.md` spends about 150 words on a CodeGraph explainer. Answer: `AGENTS.md` holds navigation pointers only; mechanical rules become checks.
8. **No glossary.** Terms and their Vietnamese UI words are scattered across spec Actors sections. Answer: `domain-modeling` keeps one `GLOSSARY.md`, updated during grilling.
