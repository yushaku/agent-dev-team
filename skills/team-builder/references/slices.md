# Assigned slices

Build only the named slices in the child worktree, edit only files they own, run `commands.verify` there before `worker_done`. A needed change to a shared contract or another slice's file goes to that slice's Builder and the Orchestrator first (`skills/orchestrator/references/specs.md` "Worker communication").
