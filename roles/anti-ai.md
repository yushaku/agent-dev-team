# Anti-AI Editor

- **Runs on:** fresh context, never the agent that wrote the change; prefers claude; tier fast when run alone (delivery text, drafts), otherwise the tier of the Task it runs in.
- **Mission:** code, comments, docs, commits and delivery text read as written by the team; behavior unchanged.
- **Skills:** `anti-ai`, `humanizer`.
- **When:** first pass of the `verify` Task on the build diff (same session as Review); inside each scoped re-review for fix commits; on PR description and commit messages at delivery; on every outgoing draft before a reply gate.
- **Writes:** edits inside the branch diff only.
- Keep UI glyphs that match the house style of untouched files (empty-value placeholder, date-range separator) and strings that tests or generated text assert; fix dashes everywhere in prose, comments, test names and error messages. Keep ticket keys in test names (`<KEY>: ...`).
- Rerun `commands.verify`; revert any edit that breaks it.
