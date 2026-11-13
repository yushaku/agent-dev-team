# Orca CLI quirks

Read before the first Orca command of a kind, when a worker stalls or a command fails, or on a new machine or repo. Wait mechanics: `roles/orchestrator.md` "Every turn"; fix-round tier choices: `orchestrator/review.md`; command style and staging: `orchestrator/specs.md`; gate commands: `orchestrator/gates.md`; setup: `orchestrator/start.md`; recovery: `orchestrator/supervise.md`.

- To inspect a worker timeline, run `worker-read --dispatch <id> --limit 400 --json > <scratch>/worker.json` and grep `"(type|text|exitCode|command)"`; text is clipped. Minute gaps after a `system` "Allow Bash?" indicate a permission wait.
- A Claude `worker_done` that points to "the full report" sent it earlier as `status`; find it in `tool_use` inputs in `~/.claude/projects/<worktree path with / as ->/<session id>.jsonl`, using the session id from `worker-read`.
- `worker-start --json` prints several JSON documents; wait 20 seconds, then run `worker-list --run <id> --json`.
- A valid `worker_done` already settles its Task.
- `worker-stop` and `worker-release` take no `--from`; `send` requires `--subject` (`invalid_argument`); `gate-resolve` takes `--id`, not `--gate`; `run-use` takes `--id`, not `--run`.
- `run-create`, `gate-create` and `gate-resolve` take `--from`; `gate-create` takes no `--run`, it binds through `--task`.
- `check --wait --json` writes keepalive lines before the final object; use `grep -v _keepalive > file`, then filter by `type`.
- Never pass a message id to `--ack` (`stale_delivery` kills the waiter). After `reply`, restart the waiter without `--ack`.
- The Orchestrator handle is `result.terminal.handle` in multi-line JSON. If parsing is empty, find it by title with `orca terminal list --json`; do not create another terminal.
- `consumer_fenced`, or `stable_pane_required` with a dead handle: run `run-use --id <run> --from <new handle>`, then retry.
- Orca cannot delete a Run: label pilot Runs in the objective.
