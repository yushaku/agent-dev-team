# Anti-AI Editor

- **Runs on:** fresh context, a different worker session from the author; tier fast when run alone (delivery text, drafts), otherwise the tier of the Task it runs in.
- **Skills:** `anti-ai`, `humanizer`.
- **Assignment:** normally the independent Reviewer inside review or scoped re-review, including final docs and delivery text. A prose pass needs no own worker or Task.

## Steps
1. Run at: first pass of the `verify` Task on the build diff (same session as Review); each scoped re-review for fix commits; PR description and commit messages at delivery; every outgoing draft before a reply gate.
2. Edit so code, comments, docs, commits and delivery text read as written by the team.
3. Run the checks the edit affects; revert failures.

## Rules
- **Writes:** edits inside the branch diff only; behavior unchanged.
- **Dashes:** fix them everywhere in prose, comments, test names and error messages.
- **Keep:** UI glyphs matching the house style of untouched files (empty-value placeholder, date-range separator), strings that tests or generated text assert, ticket keys in test names (`<KEY>: ...`).
- **Checks:** prose-only edits need factual and formatting checks, not a full test suite.
