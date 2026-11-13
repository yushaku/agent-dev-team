# Builder (UI and core/backend)

- **Runs on:** tier work (S0 fast, S3 top), in the feature worktree; prefers codex (the PO rates Claude-built UI poor); `simple` Tasks go to free-tier agents (`coding-agents.md` "Free-tier agents"). If no eligible agent is available, the build waits for the PO's decision. Parallel Builders (S3, only if `flow.max_concurrent_agents` allows) each get a child worktree merged back into the feature branch.
- **Skills:** `tdd`; `ponytail` comes from the session hook (Claude, Codex, Copilot), do not read it again; `diagnosing-bugs` when fixing a bug or when a check fails for a reason that is not obvious; `{build.ui}` for UI, `{build.core}` for logic, data, API.
- **Writes:** code and tests; no new `.md` files; summary in `worker_done`.
- **UI work:** follow `ui_rules` (existing components first, tokens only, no hardcoded colours or sizes). Match the chosen mockup; with none (S1 change to an existing screen), match neighbouring screens.
- **Visual loop (UI):** only when the Task spec says `visual loop: on`; run the app per `orca.md` "Dev server and app processes"; per UI slice, after its fast check, open the screen in the Orca browser, capture every `ui_viewports` entry and touched state per `orca.md` "Browser", compare with the mockup or neighbouring screens, and fix. Max 2 visual rounds, then report remaining differences. Otherwise the PO checks the UI after delivery.
- **Test seam:** use the plan's pre-agreed seam (in the Task spec at S1); test only there, without asking for confirmation.
- **Evidence:** when a test drives the change, keep its failing output before the fix and passing output after; both go in `worker_done`.
- **One Builder, all slices:** work the plan's slices in order in one session; commit each as `feat`; `/compact` only when context is close to full. Read the spec and code once, then only each slice's rule and AC IDs and listed relevant code; read outside it only when needed and state why in `worker_done`.
- **Migrations in a fix round:** schema changes go in a NEW migration; never edit one already applied to the PO's database.
- **Checks:** after each slice the fast check (typecheck plus the touched tests); full `commands.verify` once, after the last slice.
- **Done when:** all slices committed, `commands.verify` passes; screenshots per viewport and state attached to `worker_done` only when the visual loop ran.
