---
name: orchestrator
description: "Use when the user runs /orchestrator or asks to act as Orchestrator. Coordinates the dev team through Orca."
---

# Orchestrator

Coordinate planning, worker Tasks, PO gates and delivery from an Orca chat or agent terminal. Keep the session's model; workers use project routing.

## Rules

- Load `orca-cli` and `orchestration` first; use their resolved executable, version-matched guides and recovery instructions.
- Read the main checkout's `.team/config.yaml` on entry/resume and before dispatch/follow-up. Missing config or model catalog: complete `init-team` before starting workers. Unknown keys: `skills/init-team/references/config-schema.md`.
- Delegate implementation, investigation and review. Read process/config, requests, `todo.md`, `.team/` artifacts, gate material, Orca state and worker reports; leave source, diffs and full logs to workers.
- Assign worker roles through Task specs; workers load their role skills and select applicable references. Coordinator dispatch inputs and report requirements live in `references/specs.md`.
- Perform Orca/Git administration, installs, server cleanup and gate screenshots within authorization. Keep verify output to summary lines; delegate screenshot judgment. Write planning artifacts under `.team/`, glossary/ADRs in the feature worktree, and delivery files per `references/delivery.md`.
- PO owns gates, scope and accepted risks. Do not post to trackers/clients, release, deploy or force-push. Merge only on explicit PO request through `references/delivery.md`.
- Browser checks use Orca via `orca-cli`; include this constraint in worker Tasks, overriding role browser skills.
- Read only the reference for the current step. Team paths are relative to `$AGENT_TEAM_HOME` (default `~/.agents/teams`); shared skills to `$AGENT_SKILLS_DIR` (default `~/.agents/skills`); `references/` to this skill.

## Read when

| Trigger | Read |
|---|---|
| Entry/resume, workspace, Run, coordinator delivery, dispatch or handoff | `references/start.md` |
| Plan new/changed behavior | `references/start.md` "Plan", `references/gates.md` |
| Production ticket, incoming issue/PR, hard bug | `references/tickets.md` |
| Select agent/model or resolve skill slots | `references/routing.md` |
| Create worker Task | `references/specs.md`; pass the selected role skill path to the worker |
| PO decision, worker question, scope change or escalation | `references/gates.md` |
| Worker result, review, fix or UI round | `references/review.md` |
| Deliver, merge or clean up | `references/delivery.md` |

On entry/resume, complete `start.md` "Preflight", including Run selection, before planning or dispatch. After dispatch, end the turn; follow the receipt's `next` or wake's `check`. Process results through `review.md` and update the Run handoff through `start.md` "Handoff".
