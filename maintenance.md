# Software Maintenance Agent Team

- **Scope:** software in use (any platform), work arrives as tickets (bugs, change requests, questions).
- Output ends at a delivery (per `delivery.mode`) or a reply approved at G-Reply.
- Only the differences from dev; everything else per `README.md` and the files it lists.

## 1. What differs from feature development

| Aspect | Maintenance difference |
|---|---|
| Starts from | A ticket in a tracker |
| Source of truth | Ticket thread; latest comment overrides the description |
| Main loop | Clarify with client, investigate, fix |
| Design / Tech Lead | Only for large change requests |
| Work without code | Questions and investigations are common |
| Business spec | Updated only when a ticket changes a business rule, after G-Scope |

## 2. Roster (changes only)

### Orchestrator / Triage
- **Runs on:** the Orchestrator.
- **Mission:** poll assigned tickets, classify them (section 3), set priority, link related tickets, report a summary to the PO in the PO's language.
- **Writes:** Orca state only.
- One worktree per ticket that needs code, named by ticket key.

### Ticket Analyst (replaces Product Manager)
- **Runs on:** prefers claude.
- **Mission:** read the full thread (description and every comment), state the current requirement, list gaps and contradictions, draft replies.
- Skip changelog copies except to note scope changes.
- Translate domain terms for the PO, original term in parentheses.
- Draft every reply in `languages.client` with a `languages.po` translation.
- **Writes:** draft replies in `worker_done`.

### Investigator (new)
- **Runs on:** prefers claude.
- **Mission:** answer "why does it behave like this", reproduce bugs, find root cause, measure impact, estimate effort.
- **Skills:** `diagnosing-bugs`, `source-driven-development`, `browser-testing-with-devtools`.
- Read `branches.client_visible` (for example `origin/staging`), not a local branch that may be behind.
- Enumerate every call path to the affected code; counts in the thread may be stale.
- Back every claim with `path:line`. Effort numbers are proposals naming what drives them.
- **Writes:** findings in `worker_done`, plus a draft reply for the Analyst.

### Builder (Frontend / Backend)
- As `roles/builder.md`, plus: **failing test that reproduces the bug first**, then the smallest fix. Test name carries the ticket key (`PROJ-123: price rounds half up`).

### QA
- Focus on regression: the reproducing test, the affected flows, the surrounding call paths the Investigator found.

**Not used by default:** Researcher on demand.

## 3. Ticket types and flows

Size every ticket first (`sizing.md`):

| Type | Default size | Move up when |
|---|---|---|
| Question | **S0**: one agent session answers from code and drafts the reply (`sizing.md`) | answer needs a broad investigation (S1: one Investigator, narrow spec covering only what the reply needs) |
| Bug | **S1**: Investigator and Builder may be one Codex session (repro test, fix), then a separate Reviewer | several areas, unclear expected behavior, or a sensitive area (S2) |
| Change request | **S1** if scope is clear and small, else **S2** | new capability or unclear scope (S3 via the dev Feature flow) |
| Incident | **S1 fast-track** | root cause spans several areas (S2 for the follow-up Bug) |

Diagrams show the S2 shape; at S0/S1 skip the steps the size excludes, never the gates.

### 3.1 Question / Investigation (no code change)
```
Triage ─▶ Analyst ─▶ Investigator (answer from code) ─▶ Analyst drafts reply ─▶ [G-Reply] ─▶ PO posts
```
- Answer reveals a bug: open a Bug flow on the same ticket.

### 3.2 Bug
```
Triage ─▶ Analyst (confirm expected vs actual) ─▶ Investigator (reproduce, root cause, impact)
      ─▶ Builder (failing test, then fix) ─▶ verify (Anti-AI, Security*, Reviewer) ║ QA ─▶ deliver ─▶ [G-PR]
      ─▶ Analyst drafts "fixed, how to verify" ─▶ [G-Reply] ─▶ PO posts when the fix is live
```
- Expected behavior unclear: the Analyst asks the client first ([G-Reply]); the ticket waits.

### 3.3 Change request
```
Triage ─▶ Analyst (current requirement, gaps) ⇄ client via [G-Reply] until clear
      ─▶ Investigator (impact, estimate) ─▶ [G-Scope: PO approves scope + estimate, maybe sends it to client]
      ─▶ small: Builder ─▶ verify (Anti-AI, Reviewer) ║ QA ─▶ deliver ─▶ [G-PR] ─▶ report via [G-Reply]
      ─▶ large: switch to Feature flow (`README.md`, `workflow.md`) (Designer, Tech Lead, business spec)
```

### 3.4 Incident (production is broken)
```
Triage (page PO immediately) ─▶ Investigator + Builder in parallel ─▶ Reviewer ─▶ deliver ─▶ [G-PR, fast-track]
      ─▶ follow-up Bug ticket for the root cause and regression test
```
- Fast-track: the PO may approve G-PR and G-Reply in one step. Hotfix deploy is human.
- Suspected personal data breach: Incident flow; escalation per `workflow.md`; keep evidence (data affected, users, since when); the team prepares facts and the fix, never sends notices.
- Notifying authorities or users is the PO's or legal's decision under `compliance`.

## 4. Gates

- G-Reply on every outgoing message, G-Scope for change requests, G-PR as Gate 2 in `workflow.md`.
- The PO reads and edits each draft and translation, then posts it personally; agents never post, even when the tracker integration allows writes.

## 5. Communication rules

1. One draft per outgoing message, in the client's language, PO-language translation next to it.
2. Every draft goes through the Anti-AI pass (`anti-ai`, `humanizer`) before the PO sees it; keep the client's register (keigo level, greeting formulas).
3. Answer from code, not memory; cite `path:line` in the internal version (the client version may omit paths).
4. Mark what is waiting on whom: client, PO, or the team.
5. Reply templates: clarifying question, investigation result, estimate, fix report (what changed, how to verify, environment).
6. Never promise dates or effort in a draft without G-Scope.

## 6. Tracking

- The ticket is the record: no per-ticket files in the repo. Context lives in the thread; team findings in Orca (`worker_done`).
- Orca commands: `orca.md`.
- Board columns: `triage → clarifying → waiting-client → investigating → fixing → verifying → pr-open → done`; these labels show as In progress per `orca.md` "Board status"; `done` when the PR is merged and the final reply is posted.
- Waiting on the client is a column, not a blocked task: re-check the thread on each poll, resume when the client answers.

## 7. Intake

- Tracker, access, query, languages and branches come from the project config (`config.md`).
- Poll the configured tracker with the configured query on a schedule (Orca automation). `access: manual`: the PO pastes the ticket into chat.
- New ticket or comment: summarize for the PO, classify, propose the next step.
- Dedupe: link tickets describing the same behavior instead of investigating twice.
- Priority: incident, past due date, client waiting on us, then tracker priority, then due date. No response-time SLA.

## 8. Definition of Done

- **Question:** answer posted by the PO; no open questions on our side.
- **Bug:** reproducing test passes, regression suite green, PR approved at G-PR, fix report drafted.
- **Change request:** scope approved, PR approved at G-PR, business spec updated if a rule changed, report drafted.
- **Incident:** fix PR approved at G-PR, follow-up Bug ticket created.

## 9. Escalation

On top of `workflow.md`, ping the PO when:
- A ticket is past its due date, or due within one working day with no reply drafted.
- The root cause is in another party's system; propose a mitigation on our side.
- A fix would change behavior other tickets or clients rely on.

## 10. Metrics

- Time to first response (ticket created → first reply posted).
- Time to resolve per ticket type.
- Reopen rate.
- Regressions introduced by fixes.
- Share of tickets resolved without a code change.
