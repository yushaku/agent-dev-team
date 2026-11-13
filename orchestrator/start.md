# Start a Run

## Preflight

1. Identify the repo; ask if unclear. Read `.team/config.yaml` (fallback: legacy `## Team config` in `AGENTS.md`; none: `config.md` defaults, offer `orchestrator/bootstrap-config.md`).
2. Resolve each role's skills: role card core + slot skills (project `skills.<slot>` > profile) + `skills.project`. Report once any slot skill not installed.
3. **Size before creating anything** (`sizing.md`). Tell the PO one line: size, mode or ticket type, reason ("Ticket PROJ-456: Bug, S1, one function in cart"). Name the triggered audits (role card **Trigger** lines) in the DAG now; adding them after review costs a round.
4. Ticket work: fetch it with the configured access (`backlog`: the `backlog-ticket-review` checklist; `github`: `gh issue view --comments`; `manual`: ask the PO to paste it), plus related tickets the thread names. Summarize in `languages.po`.
5. Resume: if `.team/*/handoff.md` exists, read the newest one with its Orca Run state and continue from its next step; tell the PO one line which feature and step. For an older Run waiting at Gate 2, see `orchestrator/delivery.md`.
6. Context for picking work: `todo.md` (roadmap), `.team/carry-over.md`, and only the `.team/research/<topic>.md` files the todo item or PO names. Open-ended discussion or research the PO starts here: suggest a Researcher session (`roles/researcher.md`) instead of holding it in this one.
7. An older `.team/<feature>/plan.md` or Orca Run contradicts what the PO points to now: ask which is the source of truth; never resume the old Run silently.
8. Ask the open preflight decisions one at a time: ticket, missing config handling, uncommitted changes in the main checkout (leave or move to the worktree), and which branch holds the latest work (`git log --oneline <base>..<branch>`). No answer on the branch: cut from it and say so.
9. Check CLI sign-in before the first dispatch: `claude auth status`, `codex login status` and `cursor-agent status`. Copilot has no status command; when a Copilot Task is planned, dispatch it and follow `orchestrator/supervise.md` on failure.
10. If an answer is a different request, do that first, then ask the remaining questions again.

## Orca setup (none at S0)

- **S1 and up**, in order:
  1. `orca status --json` ready.
  2. **Resume first:** `orchestration run-list --json`, objective contains the key.
  3. Create an Orchestrator terminal before `run-create`. Use title `orchestrator <key>` and mailbox rules in `orca.md` "Orchestrator identity".
  4. `run-create --objective "<key> [<mode>]"`; create the worktree from pushed `origin/<branches.base>` with `orca worktree create --repo path:<repo> --name <KEY> --base-branch origin/<base> --branch <naming> --setup skip --comment "<KEY> <ticket url>" --json`. Link `.team` and `worktree_links` (`config.md`), add references and set Board status (`orca.md`). `--reference` accepts GitHub, GitLab, Jira and similar URLs; put a Backlog URL in `--comment`.
  5. Install dependencies in the worktree (`pnpm install --frozen-lockfile` or `npm ci --no-audit --no-fund`), then run each verify command once and keep its summary line as the Builder baseline. If a script is broken, use `npx tsc --noEmit -p .` and tell the PO it is pre-existing.
- Exception: if the local base is ahead only by docs this Run needs and pushing it is the PO's release act, cut from that base, tell the PO, and never amend the commit.
- No-code flows: no worktree; workers read `git show origin/<client_visible>:<path>`, never the working tree.
- **Parallel Runs** (independent S1 work beside a feature, or several Runs on a branch the PO names): each gets its own Run, Orchestrator terminal and worktree cut from `branches.base` or that branch, within `flow.max_concurrent_agents`. Each spec names the files the other live branch also edits and asks for small local edits there.
