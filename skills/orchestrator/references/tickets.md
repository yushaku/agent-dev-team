# Ticket mode (software in production)

- **Scope:** work arrives as tickets (bugs, change requests, questions). Output ends at a delivery (per `delivery.mode`) or a reply approved at G-Reply.
- Only the differences from dev; everything else per `workflow.md` and the files it names.

## What differs from feature development

| Aspect | Ticket mode |
|---|---|
| Starts from | A ticket in a tracker |
| Source of truth | Ticket thread; the latest comment overrides the description |
| Main loop | Clarify with client, investigate, fix |
| Business spec | Updated only when a ticket changes a business rule, after G-Scope |

## Roster (changes only)

- **Orchestrator / Triage:** poll assigned tickets, classify them (below), set priority, link related tickets, report a summary to the PO in `languages.po`. One worktree per ticket that needs code, named by ticket key (`start.md`).
- **Ticket Analyst** (replaces Product Manager): `roles/ticket-analyst.md`.
- **Investigator** (new): `roles/investigator.md`.
- **Builder:** as `roles/builder.md`, plus a failing test that reproduces the bug first, then the smallest fix. The test name carries the ticket key.
- **QA:** regression focus: the reproducing test, the affected flows, the call paths the Investigator found.

## Ticket types and flows

Size every ticket first (`sizing.md`):

| Type | Default size | Move up when |
|---|---|---|
| Question | **S0**: one agent session answers from code and drafts the reply | answer needs a broad investigation (S1: one Investigator, narrow spec covering only what the reply needs) |
| Bug | **S1**: Investigator and Builder may be one Builder session (repro test, fix), then a separate Reviewer | several areas, unclear expected behavior, or a sensitive area (S2) |
| Change request | **S1** if scope is clear and small, else **S2** | new capability or unclear scope (S3 via the dev Feature flow) |
| Incident | **S1 fast-track** | root cause spans several areas (S2 for the follow-up Bug) |

### Question / Investigation (no code change)
```
Triage ─▶ Analyst ─▶ Investigator (answer from code) ─▶ Analyst drafts reply ─▶ [G-Reply] ─▶ PO posts
```
- Answer reveals a bug: open a Bug flow on the same ticket.

### Bug
```
Triage ─▶ Analyst (confirm expected vs actual) ─▶ Investigator (reproduce, root cause, impact)
      ─▶ Builder (failing test, then fix) ─▶ verify (Anti-AI, Security*, Reviewer) ║ QA ─▶ deliver ─▶ [G-PR]
      ─▶ Analyst drafts "fixed, how to verify" ─▶ [G-Reply] ─▶ PO posts when the fix is live
```
- Expected behavior unclear: the Analyst asks the client first ([G-Reply]); the ticket waits.

### Change request
```
Triage ─▶ Analyst (current requirement, gaps) ⇄ client via [G-Reply] until clear
      ─▶ Investigator (impact, estimate) ─▶ [G-Scope: PO approves scope + estimate, maybe sends it to client]
      ─▶ small: Builder ─▶ verify (Anti-AI, Reviewer) ║ QA ─▶ deliver ─▶ [G-PR] ─▶ report via [G-Reply]
      ─▶ large: switch to Feature flow (`workflow.md`) (Designer, Tech Lead, business spec)
```

### Incident (production is broken)
```
Triage (page PO immediately) ─▶ Investigator + Builder in parallel ─▶ Reviewer ─▶ deliver ─▶ [G-PR, fast-track]
      ─▶ follow-up Bug ticket for the root cause and regression test
```
- Fast-track: the PO may approve G-PR and G-Reply in one step. Hotfix deploy is human.
- Suspected personal data breach: Incident flow; keep evidence (data affected, users, since when); the team prepares facts and the fix, never sends notices. Notifying authorities or users is the PO's or legal's decision under `compliance`.

## Communication rules

1. The PO reads and edits each draft and translation, then posts it personally; agents never post, even when the tracker integration allows writes. Gates: `gates.md`.
2. Every draft goes through the Anti-AI pass (`anti-ai`, `humanizer`) before the PO sees it; keep the client's register and greeting formulas.
3. Cite `path:line` in the internal version; the client version may omit paths.
4. Mark what is waiting on whom: client, PO, or the team.
5. A fix report states what changed, how to verify and the environment.
6. Never promise dates or effort in a draft without G-Scope.

## Intake

- The ticket is the record: no per-ticket files in the repo; team findings live in Orca (`worker_done`). Waiting on the client is a status, not a blocked task: re-check the thread on each poll, resume when the client answers.
- Poll the configured tracker with the configured query on a schedule (Orca automation). `access: manual`: the PO pastes the ticket into chat.
- New ticket or comment: summarize for the PO, classify, propose the next step.
- Dedupe: link tickets describing the same behavior instead of investigating twice.
- Priority: incident, past due date, client waiting on us, then tracker priority, then due date.

## Definition of Done

- **Question:** answer posted by the PO; no open questions on our side.
- **Bug:** reproducing test passes, regression suite green, PR approved at G-PR, fix report drafted.
- **Change request:** scope approved, PR approved at G-PR, business spec updated if a rule changed, report drafted.
- **Incident:** fix PR approved at G-PR, follow-up Bug ticket created.

## Escalation

On top of `gates.md` "Escalation", ping the PO when:
- A ticket is past its due date, or due within one working day with no reply drafted.
- The root cause is in another party's system; propose a mitigation on our side.
- A fix would change behavior other tickets or clients rely on.
