# Documentation policy

## Committed documents (complete list)

| Document | Owner | Content | Changes when |
|---|---|---|---|
| `docs/product/<capability>.md` | PM | Business spec (below) | The business changes |
| `docs/adr/NNN-title.md` | Tech Lead (feature decisions), Solution Architect (system decisions) | One technical decision | Never edited except its Status line; superseded by a new ADR |
| `AGENTS.md` | PO | Repo agent rules; read-only for the team (`## AGENTS.md`) | Never by the team |
| `.team/config.yaml` | PO (Orchestrator proposes) | Team config (`config.md`); local-only until the team adopts it | Project settings change |
| `DESIGN.md` | Designer | Visual identity: tokens in use, type, spacing, component rules | The PO picks an option at G-UI that sets a new rule |
| `README.md` | PO | What it is, how to run it | The PO asks |
| `todo.md` | PO | Roadmap; each item has **Goal**, **Outcome** (may name story IDs), a checkbox, optional `Ref: .team/research/<topic>.md` | The PO adds items; the Delivery Engineer removes shipped ones |
| `docs/diagrams/<name>.json` | Tech Lead; Solution Architect for system design diagrams | Archify spec of a kept diagram (source) | The shape it shows changes |
| `docs/diagrams/<name>.html` | Whoever changes its spec | Archify render of that spec (`frappe-docs` pipeline) | Its spec changes, in the same commit |
| `.github/workflows/pages.yml` | Delivery Engineer; the PO reviews the PR | Publishes the docs site when `docs.site: pages` (`## Published site`) | The publish list changes |

- No-op and contradiction findings are fixed by the document owner.
- Existing docs outside this list are read-only reference until the PO migrates or deletes them (`docs.legacy`).
- API reference, schema docs: generate from code when needed, never store.

## Two audiences

- Markdown and JSON specs are the source, written for agents. HTML is the human view, generated from them; it adds no fact the sources lack.
- Agents read sources only, never diagram HTML or the published site.
- Never hand-edit HTML; change the source and render it.
- Kept diagrams (`docs/diagrams/`): system overview as a C4 container view of the current system, always; deployment when infra has more than one runtime. Anything else is drawn on demand in a PR or discussion and not stored, unless the PO asks to keep one.

## Published site

- Opt-in per repo: `docs.site: pages`; off by default.
- Workflow: copy `templates/pages.yml` to `.github/workflows/pages.yml`; Jekyll renders the markdown on each push to `main`; `README.md` is the home page, repo-relative links resolve.
- No generated index page: the site is the committed markdown plus diagram HTML.
- A public repo publishes every committed doc: no secrets, personal data, client names or unreleased business terms in `docs/`.
- Enabling Pages (Settings, Pages, source GitHub Actions) is the PO's step.

## Business spec (PM output)

- One file per business capability, not per feature or ticket; a feature updates the existing file.
- English for every project; domain terms that only exist in the client's language keep the original in parentheses in the glossary.
- Allowed, business language only:
  - Purpose: the problem and who has it.
  - Actors and roles.
  - User stories, numbered (US1, US2...), one line each: `USn (<actor>): <goal>, so that <benefit>. <AC IDs>`; an AC owned by another capability is written `<capability> ACn`, never copied. A story may span several features; it is done when all its ACs pass.
  - Business rules, numbered (R1, R2...), one sentence each.
  - Main flows and exceptions, in user terms; each flow names the story it serves (`Flow for US1`) and never restates the story's goal.
  - Acceptance criteria, numbered (AC1, AC2...), Given / When / Then in business terms.
  - Glossary of domain terms.
  - Out of scope.
  - Open questions (empty before Gate 1).
  - Last line: `Retired: R3, R7, AC12` (retired IDs).
- Not allowed: solution, architecture, technology, platform, screen or component names, API, database, code, test names, file paths. A sentence that would change when the implementation changes does not belong.
- Gate 1 answers and other PO decisions for the Run live in numbered `.team/<feature>/decisions.md` items; the PM folds decided items into rules and AC, and the spec carries no `Decided at Gate 1` or post-Gate 1 `Decisions to confirm` sections or D/A/G/Q item lists. Open questions stay in their existing section.
- Worked examples belong only in the Gate 1 `walkthrough.html` sent to the PO, never in the spec.
- Size: target about 80 lines; past 150 lines, split the capability and move its stories, rules and ACs with the split; reference another capability's criteria as `<capability> ACn`. Long content lists such as catalogue text and card copy live in code or seed data, not the spec.
- Traceability is one-way, code to spec: tests reference IDs with the capability file name (e.g. `garden AC3: member cannot book past the limit`); bare `AC3` is ambiguous. Never reference story IDs; the spec never references tests or code.
- IDs: never reuse or renumber R, AC or US IDs. A wording fix keeps its ID; a meaning change gets the next free ID and retires the old one.
- Splitting a capability: IDs keep their numbers in the new file (gaps allowed), are not retired in the old file, and tests update the capability prefix.
- The commit that changes a business spec has a body listing each changed ID, its one-line decision and the date (from `.team/<feature>/decisions.md`); `git log -p` and `git blame` on the spec are its history, kept in no other file.

## ADR

- Sections: Context, Decision, Rejected options (one line each), Consequences, Status (`accepted` / `superseded by NNN`). Solution Architect system ADRs add NFR targets and monthly cost, and the PR link.
- Max about 15 lines; system ADRs about 40.
- Only for decisions expensive to reverse.
- Immutable: a changed decision gets a new ADR; the only edit to an old ADR is its Status line (`superseded by NNN`), made by the new ADR's author in the same PR.
- Agents read only `accepted` ADRs.

## Scratch

- `.team/` (ignored, never committed):
  - `<feature>/`: `plan.md` (`roles/tech-lead.md`), `decisions.md` (numbered PO decisions for the Run, including Gate 1 answers, scope cuts and Orchestrator defaults), `walkthrough.html` (Gate 1 HTML for the PO), `handoff.md`, `design/`, `specs/`, and role reports named `<role>-r<N>.md` (round number, e.g. `reviewer-r1.md`, `builder-fix-r1.md`); no other entries per feature.
  - `research/<topic>.md`: outcome of a Researcher session (product discovery): problem, who has it, how others solve it, options, smallest scope, risks, decision, open points, sources; under 60 lines; written in the Researcher session, read by the Orchestrator only when a todo item or the PO names it.
  - `carry-over.md`: numbered leftovers (file:line, why); lifecycle in `skills/orchestrator/references/delivery.md`.
- `.team/config.yaml` is the only file in `.team/` that may be committed.
- Cleanup: `skills/orchestrator/references/delivery.md`.

## Audit

- Docs audit request: S0 (`skills/orchestrator/references/sizing.md`): a table per committed doc and `.team/` file (keep, migrate to `docs/product/`, legacy, delete) with the reason, missing required docs, stale cross-references; then propose one S1 cleanup Run. Files the PO names stay (`docs.legacy`). Nothing changes before the PO's go.

## Writing

- Every sentence carries a fact, rule or decision the reader cannot get from the code, config, `--help` or another committed doc.
- No-op test: delete the sentence; if an agent or the PO would act the same without it, it stays deleted. Delete whole sentences, not words.
- Usual no-ops: intros and outros ("This document describes", "In summary"), a heading restated as a sentence, advice the model already follows ("write clean, maintainable code", "be careful", "follow best practices"), copies of lookups (command lists in `package.json`, file trees, option lists), history and credits, the same meaning in two places (keep one, link from the other), reasons with no rule attached.
- Write the target behavior; a prohibition only for a hard guardrail, paired with what to do instead.

## AGENTS.md

- Read-only for the team: no agent edits `AGENTS.md` or `CLAUDE.md`; every agent reads `AGENTS.md`.
- Verify commands: `commands.verify` in `.team/config.yaml`.
- Conventions and gotchas: a lint, CI or test check (`roles/tech-lead.md` "Mechanical findings"); one a check cannot hold is an ADR.

## Conflicts

- ADR vs code: code wins; fix or delete the line. `AGENTS.md` or `README` vs code: code wins; tell the PO the line and the fix.
- Business spec vs code: the PM decides which is wrong; changing a business rule is the PO's decision (Gate 1), never a silent agent edit.

## Reading (token budget)

- Read `AGENTS.md`, the relevant business spec, the Orca Task spec, role-slot skills and touched code; never scan `docs/` wholesale.
