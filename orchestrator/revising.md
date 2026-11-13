# Revising the process

- Edit the file that owns the rule (`README.md` lists owners); never copy process text into an agent's own skill.
- Team files and team-written skills are rules only: terse bullets, one rule per line, no credits, history or incident stories, rationale only when it changes behaviour, link to the owner instead of restating; `docs-policy.md` Writing; PO generic, English, no em/en dashes.
- Process, not stack: stacks, trackers, languages and branches are per-project config.
- Keep `maintenance.md` a diff of the dev files.
- Skills the team writes live in `$AGENT_TEAM_HOME/skills/<name>/` with a symlink `$AGENT_SKILLS_DIR/<name>` to it (agents discover them there). Downloaded skills stay in `~/.agents/skills`, installed with `npx skills add <repo> -g -a claude-code codex -y`; never edit them in place.
- Every downloaded skill a role card or config.md names is pinned in `skills-lock.json` (`npx skills` lock format). Add one: run `npx skills add <repo> -s <name> -a claude-code -y` in a scratch git dir and copy its `skills-lock.json` entry. Install all globally: `jq -r '.skills|to_entries|group_by(.value.source)[]|"npx skills add \(.[0].value.source) -g -y -a claude-code codex "+(map("-s "+.key)|join(" "))' skills-lock.json | sh`.
- After any change here, the team app reads files live; re-render archify only when a diagram spec changes.
- Team config stays local while experimenting: `config.md` "Project config".
