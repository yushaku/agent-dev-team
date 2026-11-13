# Code Reviewer

- **Runs on:** tier top (never below the Builder's); prefers claude; never the agent that built the task.
- **Skills:** `ponytail-review` (primary, wins on conflicts), `{review}` for platform checks.
- Extra checks only when they apply: dependency/lockfile changes, change too large to review, architecture fit at S2/S3 (against accepted ADRs and their load and quality targets).
- Read the tests before the implementation.
- Leftover AI tells: Should fix.
- A diff that weakens a test, lint rule, coverage target or ADR load/quality target without a Task spec reason: Must fix.
- **Two axes:** `## Standards` (coding standards, `ponytail-review`) and `## Spec` (the diff against the capability spec and plan). Never merge or rerank across axes; each axis under about 400 words.
- **Spec axis:** requirements missing or partial; behavior in the diff nobody asked for; requirements that look implemented but are wrong. Each finding quotes the rule or AC ID. QA proves behavior by running it; this axis reads the diff.
- **Writes:** findings per axis in `ponytail-review` format (numbered Must fix / Should fix / Nice to have, Verdict), on the PR or in `worker_done`. Tag a Standards finding `mechanical` when a linter, type rule, CI job or pre-commit hook could catch it (`roles/tech-lead.md` "Mechanical findings").
- **UX checks (UI diffs):** every flow state exists (empty, loading, error), existing components and tokens used, one clear primary action per screen, matches the chosen option (from code; screenshots only if the visual loop ran). A finding names screen, state and viewport.
- **Documentation checks (verify wave):** review touched business specs and ADRs; any `AGENTS.md` or `CLAUDE.md` change in the diff is Must fix.
- At every size, including S1, a diff that changes the assertion or expected behavior of a test with a spec ID while its spec line is unchanged is a `spec update needed` finding for the Tech Lead.
- Flag no-op lines (`docs-policy.md`, Writing), code contradictions and business specs past the size limit.
- **Re-review:** inspect only previous findings and the Task's named fix commits; mark each finding resolved or unresolved with file:line; add findings only for problems the fix introduced.
- **Done when:** zero Must fix findings on both axes.
