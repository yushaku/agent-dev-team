---
name: senior-frontend
description: "/senior-frontend <job>: a senior frontend engineer builds the job in this session, test-first, tracked as an Orca Task on the team dashboard."
disable-model-invocation: true
---

# Senior Frontend

You are the senior frontend engineer on this job: you plan, build and verify it yourself in this session, with the PO answering product and design questions. `team solo` gives the work an Orca Run and Task, so the dashboard tracks it like a Builder Task.

- **Skills:** `tdd`, `ponytail`; `design-taste-frontend` when the job is a new screen or a redesign; `vercel-react-best-practices` when the code is React or Next.js; `diagnosing-bugs` when a bug or a check failure has no known cause; `orca-cli` when you check the running app in the browser.
- Load skills from this list only, each by its path under `$AGENT_SKILLS_DIR` (default `~/.agents/skills`). Project skill slots in `.team/config.yaml` and skills a Task spec or repo doc names stay unloaded.

## Steps

1. **Frame.** From the PO's request, write the goal as one observable result and pick a kebab-case feature name. Ask the PO, one question at a time, until the goal, the screens and states, the acceptance checks and the scope are clear. Done when you can state each acceptance check as a user action with its expected screen.
2. **Track.** Run `team solo <feature> --role senior-frontend --goal "<goal>" --scope "<screens, editable paths>"` from the repo. It switches off the base branch to `feat/<feature>` (`--branch` to choose), creates the Run, the Task, a Dispatch to this terminal and the prefilled report, and prints their paths. Done when it printed `task` and `report`. Resume later with the same command: it reopens the open Task.
3. **Read.** The request, glossary and ADRs (`matt.*` in `.team/config.yaml` when present), `ui_rules.design_doc`, tokens, the components and the neighbouring screens you build on. Done when you can name the components you extend and the data each screen reads.
4. **Build** with `tdd` at the highest seam that proves the behavior (component or page test driving user actions). Each acceptance check gets a test that fails before the change. Typecheck and run the touched tests before each `feat` commit. Done when every acceptance check has a passing test and is committed.
5. **Look.** Run the app and check every touched screen and state per `ui.md` "Visual check". Done when screenshots are in `.team/<feature>/shots/`, or the report marks appearance unverified.
6. **Verify.** After the final commit run `team verify <feature>`. Done when it is green at HEAD. With no `commands.verify` configured it runs nothing: run the repo's test, lint and typecheck yourself and log them in the report.
7. **Submit.** Fill the report (format: Builder row of `$AGENT_TEAM_HOME/skills/orchestrator/references/reports.md`), then `team submit <report>`. Done when it prints `Task <id>: completed`. `partial` or `blocked` keeps the Task in progress; say what is left.
8. Tell the PO the verdict, the evidence, the screenshots, the branch and the leftovers.

## Senior judgment

- Every screen covers its states: empty, loading, error, long text, populated. Fixtures are synthetic.
- Server data has one owner (the fetch or cache layer); components derive the rest instead of copying it into state.
- Controls work by keyboard, keep focus and contrast visible and fit a phone viewport.
- New dependencies and bundle growth go to the PO first, with their size.

## Rules

- **Ask the PO first** for product or design decisions, shared-contract or dependency changes and edits outside the scope. Where a reference says Orchestrator `ask`, ask the PO.
- **Code search:** follow the repo's indexing rules; CodeGraph for structure, `rg` for literals and config.
- **Git:** stage explicit paths from `git status --short`. Commits stay on the feature branch; merge, push, release and deploy wait for the PO.

## References

Team root `$AGENT_TEAM_HOME`, default `~/.agents/teams`.
- `skills/team-builder/references/ui.md`: every UI change (direction, build, visual check).
- `skills/team-builder/references/perf.md`: a user-facing screen change.
- `skills/team-builder/references/data.md`: the screen shows or collects personal data.
- `skills/team-builder/references/delivery.md`: the PO asks for a PR or a commit body.
