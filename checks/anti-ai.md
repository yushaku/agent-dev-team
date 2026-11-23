# Anti-AI check

A checklist, not a worker: it never gets its own session or Task.

- **Run by:** the independent Reviewer inside the `verify` Task and each scoped re-review; the session that wrote the text for PR descriptions, commit messages and outgoing drafts.
- **Trigger:** first pass of `verify` on the build diff; each scoped re-review for fix commits; PR description and commit messages at delivery; every outgoing draft before a reply gate.
- **Skills:** `anti-ai`, `humanizer`.
- **Output:** prose edits inside the branch diff, plus any style findings in the Reviewer's report (never blocking).

## Steps
1. Edit so code, comments, docs, commits and delivery text read as written by the team.
2. Run the checks the edit affects; revert failures.

## Rules
- **Writes:** edits inside the branch diff only; behavior unchanged.
- **Dashes:** fix them everywhere in prose, comments, test names and error messages.
- **Keep:** UI glyphs matching the house style of untouched files (empty-value placeholder, date-range separator), strings that tests or generated text assert, ticket keys in test names (`<KEY>: ...`).
- **Checks:** prose-only edits need factual and formatting checks, not a full test suite.
