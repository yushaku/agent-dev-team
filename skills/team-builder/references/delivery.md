# Delivery

- Follow Task delivery mode: PR → draft with configured title and green CI; branch → feature commits, push only if `delivery.push`. Put delivery text in `## Commit body`.
- Write delivery, `todo.md` and CI config per architect ADR. Propose `.team/config.yaml` verify changes to PO through Orchestrator.

## Before a PR from a long-lived branch

Before final review:

- Fetch origin; confirm target and count outgoing commits/authors with `git log origin/<target>..HEAD`.
- Other-author commits absent from remote branches and not marked `-` by `git cherry origin/<target> <sha>`: disclose and ask before opening PR.
- Merge target in a separate worktree; no rebase while PO's dev server runs. Check semantic conflicts in changed models/callers; typecheck with that worktree's generated clients.
- Apply migrations to a throwaway empty DB; require empty schema diff, then drop DB.
- Rerun post-merge failing tests unmerged; pre-existing failures get separate `test:`/`fix:` commits.
- Stacked PRs: after base merges, merge target into dependents again. Stale remote overwrite requires PO approval and `--force-with-lease=<branch>:<sha>`.
- Before dropping `wip`, measure live lines with `git blame`; surviving lines require squash on merge, not deletion.

## Body

Load `$AGENT_SKILLS_DIR/pr/SKILL.md`: Summary visual, Evidence before/after, Merge Danger (Door, Blast Radius). Add:

- First line after Summary: `Tickets: <NN-slug list>; spec: <path>`.
- **Evidence:** label gaps "missing"; raw logs stay in `.team/<feature>/logs/`.
- **Human steps:** PO manual tests and applicable `human_only` steps, or "none".
- When adding Pages, include the site URL.
- Omit verify commands; include test instructions only for PO manual checks.
