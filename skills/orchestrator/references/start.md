# Start a Run

## Preflight

1. Identify the repo; ask if unclear. Read `.team/config.yaml`; none: use the `config.md` defaults and offer `/init-team` (skill `init-team`).
2. Resolve each role's skills: role card core + slot skills (project `skills.<slot>`) + `skills.project`. Report once any slot skill not installed.
3. **Size before creating anything** (`sizing.md`). Tell the PO one line: size, mode or ticket type, reason. Name the triggered audits (role card **Trigger** lines) in the DAG now.
4. Ticket work: fetch it with the configured access (`github`: `gh issue view --comments`; `manual`: ask the PO to paste it; other trackers: the tracker's skill or MCP), plus related tickets the thread names. Summarize in `languages.po`.
5. Resume: if `.team/*/handoff.md` exists, read the newest one with its Orca Run state and continue from its next step; tell the PO one line which feature and step.
6. Context for picking work: `todo.md`, `.team/carry-over.md`, and only the `.team/research/<topic>.md` files the todo item or PO names. Open-ended product or design discussion: point the PO to a Researcher or Solution Architect session instead of holding it here.
7. An older `.team/<feature>/plan.md` or Orca Run contradicts what the PO points to now: ask which is the source of truth; never resume the old Run silently.
8. Ask the open preflight decisions one at a time: ticket, missing config handling, uncommitted changes in the main checkout (leave or move to the worktree), and which branch holds the latest work (`git log --oneline <base>..<branch>`). No answer on the branch: cut from it and say so.
9. Check sign-in for each agent the dispatch wave uses (`coding-agents.md` "Registry").

## Orca setup (none at S0)

- **Mapping:**
  - Feature or ticket = one worktree, from S1 up; stage = workspace status; ticket or PR link = `worktree set --issue/--pr`, `reference add`.
  - One feature = one Run; role work = Task with deps, titled `<role>: <what>`.
  - Gate 1, G-UI, Gate 2 = decision gates; recurring checks = automations.
- **Board mapping:** Run started = `in-progress`, delivered and Gate 2 open = `in-review`, merged = `completed`.
- **S1 and up**, in order:
  1. `orca status --json` ready.
  2. **Resume first:** `orchestration run-list --json`, objective contains the key.
  3. Create an Orchestrator terminal before `run-create`, titled `orchestrator <key>`, open for the Run's life. Pass `--from <its handle>` (`orca terminal show --json`) on every orchestration command and `--terminal <handle>` on `check`; the Run records it as `coordinator_handle`, so worker `ask`, heartbeats and `worker_done` land in its inbox.
  4. `run-create --objective "<key> [<mode>]"`; create the worktree from pushed `origin/<branches.base>` with branch `branches.naming`, setup skipped, the ticket URL in `--reference` or `--comment`. Link `.team` and `worktree_links` (`config.md`), add references and set Board status.
  5. Install dependencies in the worktree (`commands.install`), then run each verify command once and keep its summary line as the Builder baseline. A broken baseline script: report it to the PO as pre-existing and use the nearest check.
- No-code flows: no worktree; workers read `git show origin/<client_visible>:<path>`, never the working tree.
