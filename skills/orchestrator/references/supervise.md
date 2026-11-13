# Execute and supervise

1. `worker-start --task <id> --worktree <sel> --agent <id> --model <model> --effort <level> --run <run> --from <handle> --json` (Builders and the Tech Lead add `--keep-open`); agent per `coding-agents.md` "Routing", model and effort from the Task's tier (`coding-agents.md` "Model tiers").
2. Max workers = `flow.max_concurrent_agents`; with `serial: true` only one worker runs verify at a time.
3. Parallel work only when the PO asks for speed and the files are disjoint:
   - Parallel tracks: the API worker freezes the shared contract first and reports any change; merge and verify once both finish.
   - Parallel Runs: each gets its own Run, Orchestrator terminal and worktree cut from `branches.base` or the branch the PO names; each spec names the files the other branch also edits.
4. The PO drops steps ("only need the builder"): keep the Tech Lead; name the guard lost and move its checks into Builder tests, except UI rounds (`review.md` "UI rounds"). Before merge, run one review of the whole `<base>..<branch>` diff with the dropped audit's checks first, and a Delivery Task beside it.
5. Before every commit, handoff or new spec, compare `git log --oneline origin/<base>..HEAD` with recorded shas. The PO may amend, squash, reword, revert or reset mid-Run: report it, reread files at HEAD, stop affected reviewers and re-review the final commit with a handoff listing each requested change as intended. Never reset back.

## Failures and recovery

- A failed Task: inspect `worker-show --dispatch <id> --json` and `lastError`. Failed at start: release it and escalate, often the CLI is not signed in. A free-tier agent failure follows `coding-agents.md` "Free-tier agents".
- A fast-tier Builder fails with no diff: re-dispatch on the same model with effort one step up, and `send` a note with direct edits to try, tests to extend, and to ask instead of sending `worker_done` if blocked.
- An unfinished `worker_done`: re-dispatch the same Task and model with a handoff of uncommitted files, open items in order and one commit at the end; this stays in the same fix round.
- A stopped worker that did not report but whose last output names a commit: settle its Task as completed with a summary.
- Before escalating, check `worker-list`; an already `succeeded` dispatch makes the escalation stale.
- A permission or sandbox denial blocks a worker: tell the PO the worker tab, the exact command to Allow and the lasting fix (`coding-agents.md` "Permission prompts"); never change global agent config.
- Commands for re-dispatch, stop, cancel and steer: `orca-quirks.md` "Recovery".
