# Execute and supervise

Waiting and reading results: `roles/orchestrator.md` "Every turn".

1. `worker-start --task <id> --worktree <sel> --agent codex|claude|copilot|cursor --model <model> --effort <level> --run <run> --from <handle> --json` (Builders add `--keep-open`); agent per `coding-agents.md` "Routing", model and effort from the Task's tier (`coding-agents.md` "Model tiers": `copilot` takes neither flag, `cursor` only `--model auto`).
   - Free-tier agent Task fails (monthly allowance exhausted, CLI not signed in, or verify fails once): rerun it on codex or claude at tier fast and tell the PO one line; never a second attempt on that Task on the same free-tier agent. The rerun starts the verify-round count at zero (`coding-agents.md` "Free-tier agents").
   - A role whose tier `models.roles` or a size rule lifts above fast leaves free-tier agents.
2. Max workers = `flow.max_concurrent_agents`; with `serial: true` only one worker runs verify at a time. Parallel tracks only when the PO asks for speed and slices touch disjoint files: the UI track gets a child worktree cut from the commit holding the shared contract (migration, shared types), copies of spec, ADR and plan, builds against the plan's API section with fetch mocked, never touching server, migrations or test helpers; the API worker freezes the contract and reports any change first; merge and verify once both finish.
3. Long waits: report status; resume from Orca state (`orchestrator/start.md`, resume first) when the PO comes back.
4. The PO changed the process mid-Run: reread only the team files newer than the Run's start (`find $AGENT_TEAM_HOME -type f -newer <Run's first scratch file>`), add the Tasks the deltas require when a slot frees, leave finished and running workers as they are, and tell the PO which deltas changed the Run and which steps ran the old way.
5. The PO drops steps ("only need the builder"): keep PM and Tech Lead; name the guard lost and move its checks into Builder tests, except UI rounds (`orchestrator/review.md` "UI rounds").
   - After build, follow "Board mapping" in `orchestrator/start.md` and list undone items (review).
   - Before merge, run one review of the whole `<base>..<branch>` diff with the dropped audit's checks first, and a Delivery Task beside it.
6. The PO flags slowness or token burn: offer merge options with time estimates instead of continuing silently.

## Failures and recovery

- For blocked or slow workers, follow `roles/orchestrator.md` "Every turn"; `worker-read --limit` returns the oldest messages.
- For a failed Task, inspect `worker-show --dispatch <id> --json` and `lastError`. If it failed at start, release it and escalate, often the CLI is not signed in.
- A fast-tier Codex Builder failed with no diff: re-dispatch on the same model with effort one step up; `send` a note with direct edits to try, tests to extend, and to ask instead of sending `worker_done` if blocked.
- An unfinished `worker_done`: re-dispatch the same Task and model, send a handoff with uncommitted files, open items in order, and one commit at the end; this stays in the same fix round.
- A stopped worker that did not report but whose last output names a commit: `worker-stop`, then `task-update --status completed --result "<summary>"`.
- Verify and commit each file outside worker Ownership, then name it in the Reviewer's handoff.
- Re-dispatch with `worker-release`, `task-update --id <task> --status ready --run <run> --from <handle>`, then `worker-start`.
- Stop an active worker with `worker-stop --dispatch <id>` when scope changes; release only a settled worker or Orca returns `dispatch_inactive`. Read `argv` in `worker-show` `projection.nextAction`.
- Cancel a merged Task with `task-update --status failed --result "cancelled: merged into <task>"`.
- Steer or widen scope with `send --to dispatch:<id> --type status`; `--to <terminal>` fails with `sender_not_assignee`.
- A PO amendment to a commit under review: stop the Reviewer, then start a fresh review of the final commit with a handoff listing each requested change as intended.
- Before every commit, handoff or new spec, compare `git log --oneline origin/<base>..HEAD` with recorded shas. The PO may squash, reword, revert or reset mid-Run; report changes, reread files at HEAD and quote only current shas. Never reset back.
- Before escalating, check `worker-list`; an already `succeeded` dispatch makes the escalation stale.
- For a worker blocked by a permission or sandbox prompt, or Codex EPERM, follow the orchestrating agent's permission notes. Tell the PO the worker tab, exact command to Allow, and lasting fix; never change global agent config.
