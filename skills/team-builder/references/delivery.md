# Delivery

- Follow Task delivery mode: PR → draft with configured title and green CI; branch → feature commits, push only if `delivery.push`. Put delivery text in `## Commit body`.
- Write delivery, `todo.md` and CI config per architect ADR. Propose `.team/config.yaml` verify changes to PO through Orchestrator.

## Before a PR from a long-lived branch

Before final review:

- Run `team pr-preflight <target>`: it fetches, counts outgoing commits by author, and lists each `ask PO` (another author's commit on no remote branch and not in target) and each `wip` commit with its live lines. Disclose every `ask PO` line and ask before opening the PR; a `wip` with live lines needs squash on merge, not deletion.
- Merge target in a separate worktree; no rebase while PO's dev server runs. Check semantic conflicts in changed models/callers; typecheck with that worktree's generated clients.
- Apply migrations to a throwaway empty DB; require empty schema diff, then drop DB.
- Rerun post-merge failing tests unmerged; pre-existing failures get separate `test:`/`fix:` commits.
- Stacked PRs: after base merges, merge target into dependents again. Stale remote overwrite requires PO approval and `--force-with-lease=<branch>:<sha>`.

## Body

Load `$AGENT_SKILLS_DIR/pr/SKILL.md`: Summary visual, Evidence before/after, Merge Danger (Door, Blast Radius). Add:

- First line after Summary: `Tickets: <NN-slug list>; spec: <path>`.
- **Evidence:** label gaps "missing"; raw logs stay in `.team/<feature>/logs/`.
- **Human steps:** PO manual tests and applicable `human_only` steps, or "none".
- When adding Pages, include the site URL.
- Omit verify commands; include test instructions only for PO manual checks.
