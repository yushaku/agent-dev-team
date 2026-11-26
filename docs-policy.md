# Documentation policy

Read when creating, editing or reviewing documentation; load only the relevant sections. Routine worker reports use `skills/orchestrator/references/reports.md`.

## Committed documents (complete list)

| Document | Owner | Content | Changes when |
|---|---|---|---|
| `matt.glossary` (`GLOSSARY.md`) | Orchestrator (grill, `domain-modeling`) | Domain terms, no implementation details | A term is resolved |
| `matt.adr` (`docs/adr/NNN-title.md`) | Orchestrator (grill, feature decisions), Solution Architect (system decisions) | One technical decision | Never edited except its Status line; superseded by a new ADR |
| `AGENTS.md` | PO | Repo agent rules; read-only for the team (`## AGENTS.md`) | Never by the team |
| `.team/config.yaml` | PO (Orchestrator proposes) | Team config (`skills/init-team/references/config-schema.md`); local-only until the team adopts it | Project settings change |
| `DESIGN.md` | Builder | Visual identity: tokens in use, type, spacing, component rules | The PO picks a prototype variant at G-UI that sets a new rule |
| `README.md` | PO | What it is, how to run it | The PO asks |
| `todo.md` | PO | Roadmap; each item has **Goal**, **Outcome** (may name story IDs), a checkbox, optional `Ref: .team/research/<topic>.md` | The PO adds items; the Orchestrator removes shipped ones |
| `docs/diagrams/<name>.json` | Builder; Solution Architect for system design diagrams | Archify spec of a kept diagram (source) | The shape it shows changes |
| `docs/diagrams/<name>.html` | Whoever changes its spec | Archify render of that spec (`frappe-docs` pipeline) | Its spec changes, in the same commit |
| `.github/workflows/pages.yml` | Orchestrator for a template copy, Builder for changes; the PO reviews the PR | Publishes the docs site when `docs.site: pages` (`## Published site`) | The publish list changes |

- Committed documents are edited and committed by their assigned owner; the commit body lives in that commit.
- The Builder owns related documentation by default. Assign a specialist author only for a specific need; include assigned paths in the Task. Existing read-only documents stay read-only unless the PO authorizes changes.
- Finalize implementation-related docs once the solution settles, before final review; do not dispatch an author for each intermediate code adjustment. Accepted ADRs remain immutable.
- No-op and contradiction findings are fixed by the assigned document owner.
- Existing docs outside this list, including `docs/product/` business specs, are read-only reference until the PO migrates or deletes them (`docs.legacy`).
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

## Spec and tickets

- Spec: `to-spec` template, kept at `.team/<feature>/spec.md` (local). Tickets: `to-tickets` local format under `matt.tracker`, one file per Orca Task, no status in them. Both avoid file paths and code, and use `GLOSSARY.md` terms.
- English for every project; a domain term that only exists in the client's language keeps the original in parentheses in the glossary.
- PO decisions for the Run live in numbered `.team/<feature>/decisions.md` items; the Orchestrator folds decided items into the spec or tickets.
- Changing a business rule is the PO's decision (Gate 1), never a silent agent edit.
- Tests name the ticket or spec rule they prove; the spec never references tests or code.

## ADR

- Sections: Context, Decision, Rejected options (one line each), Consequences, Status (`accepted` / `superseded by NNN`). Solution Architect system ADRs add NFR targets and monthly cost.
- Max about 15 lines; system ADRs about 40.
- Only for decisions expensive to reverse.
- Immutable: a changed decision gets a new ADR; the only edit to an old ADR is its Status line (`superseded by NNN`), made by the new ADR's author in the same commit.
- Agents read only `accepted` ADRs.

## Audit

- Docs audit request: read-only: a table per committed doc and `.team/` file (keep, legacy, delete) with the reason, missing required docs, stale cross-references; then propose a scoped cleanup. Files the PO names stay (`docs.legacy`). Nothing changes before the PO's go.

## Writing

- Every sentence carries a fact, rule or decision the reader cannot get from the code, config, `--help` or another committed doc.
- No-op test: delete the sentence; if an agent or the PO would act the same without it, it stays deleted. Delete whole sentences, not words.
- Usual no-ops: intros and outros ("This document describes", "In summary"), a heading restated as a sentence, advice the model already follows ("write clean, maintainable code", "be careful", "follow best practices"), copies of lookups (command lists in `package.json`, file trees, option lists), history and credits, the same meaning in two places (keep one, link from the other), reasons with no rule attached.
- Write the target behavior; a prohibition only for a hard guardrail, paired with what to do instead.

## AGENTS.md

- Read-only for the team: no agent edits `AGENTS.md` or `CLAUDE.md`; every agent reads `AGENTS.md`.
- Verify commands: `commands.verify` in `.team/config.yaml`.
- Conventions and gotchas: a lint, CI or test check (`skills/team-reviewer/SKILL.md` "Must fix"); one a check cannot hold is an ADR.

## Conflicts

- ADR vs code: code wins; fix or delete the line. `AGENTS.md` or `README` vs code: code wins; tell the PO the line and the fix.
- Spec or ticket vs code: the Orchestrator establishes which is wrong against approved decisions; changing a business rule is the PO's decision (Gate 1), never a silent agent edit.

## Reading (token budget)

- Read `AGENTS.md`, the Task's ticket and spec, the glossary, the Orca Task spec, role-slot skills and touched code; never scan `docs/` wholesale.
