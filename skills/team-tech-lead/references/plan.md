# Plan

- **Vertical slices:** each is one user-visible behaviour end to end (data, API, UI), one `feat` commit, its own rule and AC IDs. Never split by layer.
- **Fewest slices** that can be verified independently. Split further only for real parallel work (`flow.max_concurrent_agents` > 1, disjoint files) or a slice past half a context window; state the reason.
- **Parallel slices:** give each slice `after:` (slices it needs merged first, or none) and the files it owns. Slices with no `after:` and disjoint files run in parallel. Shared contracts (types, API shapes, schema, migration numbering) go in the first slice; users of them list it in `after:`.
- **`plan.md`:** under about 150 lines, rewritten in place, no history, decision trace or copied PO decisions; link `.team/<feature>/decisions.md` items.
- **Contents:** slices with story/rule/AC IDs (story IDs first; stories may span slices or Runs), files and symbols, data/API shapes (one line each), fast check, test seam (highest existing seam for the ACs; one per feature when possible; add one only if none exists), `Boundaries`, risks. No SQL or code.
- **Boundaries:** a section for Builders with `Always` (e.g. run `commands.verify` before `worker_done`), `Ask first` (change to a shared contract, schema, dependency or file outside the slice: ask the Orchestrator), `Never` (e.g. edit a merged migration, weaken a test). Only items specific to this feature.
- **Simple Tasks:** mark a Task `simple` only for a rename, lint fix, text change, single-file edit covered by existing tests, or other mechanical edit (routing in `skills/orchestrator/references/routing.md` "Model routing").
