# Orca CLI quirks and recipes

Read when an Orca command fails or a worker stalls. Flags are in `orca <command> --help` and the `orca-cli` and `orchestration` skills; this file holds only what they lack.

## Waiting

- `orca orchestration check --terminal <handle> --wait --types worker_done,escalation,question --timeout-ms <ms> --json`: use the longest supported timeout (about 10 minutes, within the shell tool's limit) and loop without polling between waits.
- It returns and marks handled the oldest unread batch. One waiter per handle: a second steals messages.
- Output has `_keepalive` lines before the final object: filter with `grep -v _keepalive > file`, then filter by `type`.
- Never pass a message id to `--ack` (`stale_delivery` kills the waiter). After `reply`, restart the waiter without `--ack`.
- After an empty timeout run one `worker-list`; if heartbeats stopped, read the worker terminal tail with `orca terminal read --terminal <agentTerminalHandle>`.

## Ids and handles

- Task id from `task-create`: `result.taskId` or `result.task.id`, else `task-list --run <id> --json`.
- `worker-start --json` prints several JSON documents: wait 20 seconds, then `worker-list --run <id> --json`.
- The Orchestrator handle is `result.terminal.handle` in multi-line JSON. If parsing is empty, find it by title with `orca terminal list --json`; never create another terminal.
- `consumer_fenced`, or `stable_pane_required` with a dead handle: `run-use --id <run> --from <new handle>`, then retry.
- `gate-create` binds through `--task`, not `--run`. A missing gate spec fails with ENOENT.
- A valid `worker_done` already settles its Task.

## Reading a worker

- `worker-read --dispatch <id> --limit 400 --json > <scratch>/worker.json` returns the oldest messages; grep `"(type|text|exitCode|command)"`. Text is clipped. Minute gaps after a `system` "Allow Bash?" mean a permission wait.
- A report that points to "the full report" or an earlier message: read the worker timeline (`coding-agents.md` "Transcripts").

## Recovery

- Re-dispatch: `worker-release`, `task-update --id <task> --status ready --run <run> --from <handle>`, then `worker-start`.
- Fix on a settled Builder: `worker-start --task <fix> --run <run> --worktree <its workspace> --terminal <its agent terminal>`, no `--agent/--model/--effort`.
- Stop an active worker with `worker-stop --dispatch <id>` when scope changes; release only a settled worker or Orca returns `dispatch_inactive`. Read `argv` in `worker-show` `projection.nextAction`.
- Settle a stopped worker that named a commit: `worker-stop`, then `task-update --status completed --result "<summary>"`.
- Cancel a merged Task: `task-update --status failed --result "cancelled: merged into <task>"`.
- Steer or widen scope: `send --to dispatch:<id> --type status`; `--to <terminal>` fails with `sender_not_assignee`.
- Run cleanup: `worker-release --dispatch <id>` each settled worker in `worker-list --run <id> --terminal-state retained|reclaimable` (on `release_pending` or `release_unknown` follow the receipt; skip PO-owned or unproven terminals), then `terminal close` the DEV pane and the Orchestrator terminal.
- Cleanup of delivered worktrees: `orca worktree rm --worktree path:<wt> --delete-branch`.

## Dev server and browser

- DEV pane: `terminal list --worktree`, match `paneTitle` `DEV`; else create it and `terminal set-pane-title --title DEV`. Restart it (interrupt, rerun) before giving the PO a URL; URL from `orca ports` `advertisedUrl`. On `runtime_access_denied` the worker `ask`s the Orchestrator to start DEV.
- Browser profile: `tab profile list`, else `tab profile create --label <project>-<account> --scope isolated`; `tab create --url <u> --profile <id>`. Shots per viewport (`set device`) and colour scheme (`set media --color-scheme light|dark`).
