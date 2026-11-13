# Orca tracking

| Team concept | Orca primitive | Command |
|---|---|---|
| Feature card | Worktree, one per feature or ticket, from S1 up (S0 creates none) | `orca worktree create`, shown on the Orca Board |
| Feature stage | Workspace status (Board status below) | `orca worktree set --workspace-status <id>` |
| Ticket / PR link | Linked issue, PR, Linear, Jira | `orca worktree set --issue/--pr/--linear-issue`, `orca reference add` |
| One feature's work | Run | `orca orchestration run-create --objective "<feature>"` |
| Role work item | Task with deps (DAG) | `orca orchestration task-create --task-title "<role>: <what>" --deps [...]` |
| A role doing the work | Supervised worker | `orca.md` "Commands" |
| Role finished, with evidence | `worker_done` summary + `--outcome` | sent by the worker |
| Questions to Orchestrator | `ask` / `reply` | through the Run inbox |
| Gate 1, G-UI, Gate 2 | Decision gate blocking a Task | `orca orchestration gate-create` / `gate-resolve` |
| Recurring checks | Automation | `orca automations create` |

## Commands

- **Task spec contract:** Target, Change, Constraints, Ownership (what it may edit), Observable acceptance.
- **Task states:** pending, ready, dispatched, completed, failed, blocked.
- **Worker:** `worker-start --task <id> --worktree current|new-child|<sel> --agent codex|claude|copilot|cursor --run <run_id> --model <model> --effort <level>` (agent per `coding-agents.md` "Routing"; model and effort from the Task's tier, `coding-agents.md` "Model tiers"); its handle (`structworker_...`) is in `worker-list`.
- **Reuse a Builder** (`orchestrator/review.md`): `worker-start --task <fix> --run <run> --worktree <its workspace> --terminal <its agent terminal>`; no `--agent/--model/--effort`.
- Handles go stale on an Orca restart (`terminal_handle_stale`): re-list, use only the new handle.
- **Overview:** `orca worktree ps --json`, `orchestration task-list --run <id>`, `gate-list`, `inbox`, `worker-list --run <id>`; live transcript: `orca terminal read --terminal <agentTerminalHandle>`.
- **Run objective:** `"<key or feature> [<mode>]"`, so a later session can find and resume it.

## Dev server and app processes

- Run the app only in the worktree's Orca pane titled `DEV`, never in your own shell or a background process; report its handle in `worker_done`.
- Find it with `terminal list --worktree <sel>` (match `paneTitle`); else `terminal create --worktree <sel> --title dev --command "<dev command>"` + `terminal set-pane-title --title DEV`.
- Logs: `terminal read --cursor <nextCursor>` (new output only), `--screen` for TUI state.
- Restart (no ask needed): `send --interrupt`, then `send --text "<cmd>" --enter`; always before giving the PO a URL.
- URL: `orca ports --worktree <sel>` (`advertisedUrl`); `lsof` only for servers outside Orca.
- Worker gets `runtime_access_denied`: `ask` the Orchestrator to start DEV.

## Browser

- One isolated profile per test account, label `<project>-<account>`, reused across Runs: `tab profile list`, else `tab profile create --label <l> --scope isolated`; open with `tab create --url <u> --worktree <sel> --profile <id>`.
- Shots (visual loop or G-UI, profile `ui_screenshots: true`): per viewport `set device --name "<device>"`, per scheme `set media --color-scheme light|dark`, then `screenshot --page <id>` into `.team/<run>/`.

## Orchestrator identity

Orchestration commands need a sender terminal handle (the mailbox address). The Orchestrator runs in its own Orca terminal; that terminal's handle is the mailbox. Per Run:

1. Read the handle of your own terminal (`orca terminal show --json`; if it needs a handle, find yours in `orca terminal list --json`). Keep the terminal open for the Run's life.
2. Pass `--from <handle>` on every orchestration command and `--terminal <handle>` on `check`.
3. The Run records it as `coordinator_handle`; workers' `ask`, heartbeats and `worker_done` land in its inbox.

## Board status

- `--workspace-status` shows only `todo`, `in-progress`, `in-review`, `completed`; any other id is saved but shown as In progress.
- Map: Run started = `in-progress`, delivered and Gate 2 open = `in-review`, merged = `completed`.
