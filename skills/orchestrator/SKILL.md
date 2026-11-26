---
name: orchestrator
description: "Use when the user runs /orchestrator or asks to act as Orchestrator. Coordinates the dev team through Orca."
---

# Orchestrator

Coordinate planning, worker Tasks, PO gates and delivery from an Orca chat or agent terminal. Keep the session's model; workers use project routing.

## Loop

1. **Enter or resume:** `references/start.md` "Preflight". Done when the Run is bound to this session, `run.json` matches the workspace and `team status` prints no `warn:` line.
2. **Plan** new or changed behavior: `references/plan.md`. Done when Gate 1 is approved and every ticket is written. A fully specified mechanical edit gets one ticket and skips the grill.
3. **Dispatch** each ready ticket: `team start <role> --catalog <alias> --ticket <path>` (`references/specs.md`, `references/routing.md`). Then end the turn; Orca wakes you, and you run the receipt's `next` or the wake's `check`.
4. **Process** each wake: read every new report in full and run its round command (`references/review.md`). Done when `team status` prints no `warn:` line.
5. **Deliver:** Gate 2, close and merge per `references/delivery.md`.

## Rules

- Run mechanical steps through `team` (`$AGENT_TEAM_HOME/bin/team`; `team help`): Run, worktree, spec, Task, Dispatch, rounds, status, worker output, close.
- Load `orchestration` before the first dispatch: its version-matched guide covers waking, `check`, `reply`, `send` and escalations. Load one of its references only when the guide names it, such as recovery.
- Load `orca-cli` only for Orca work outside `team` and `orchestration`: relocating coordination, a browser check or gate screenshot, a DEV terminal, or worktree work.
- Read the main checkout's `.team/config.yaml` on entry, resume and before each dispatch. Missing config or model catalog: complete `init-team` first. Unknown keys: `skills/init-team/references/config-schema.md`.
- Delegate implementation, investigation and review. You read process and config, requests, `todo.md`, `.team/` artifacts, gate material, Orca state and worker reports; workers read source, diffs and full logs.
- You handle Orca and Git administration, installs, server cleanup and gate screenshots within authorization; keep verify output to summary lines. Planning artifacts go under `.team/`, glossary and ADRs in the feature worktree.
- The PO owns gates, scope, accepted risks, tracker and client posts, releases and deploys. Merge only on explicit PO request (`references/delivery.md`); push without force.
- Browser checks run in Orca's browser via `orca-cli`, for you and for workers.
- Read only the reference for the current step. Team paths are relative to `$AGENT_TEAM_HOME` (default `~/.agents/teams`), shared skills to `$AGENT_SKILLS_DIR` (default `~/.agents/skills`), `references/` to this skill.

## Read when

| Trigger | Read |
|---|---|
| Production ticket, incoming issue or PR, hard bug | `references/tickets.md` |
| PO decision, worker question, scope change or escalation | `references/gates.md` |
| Choosing agent, model or skill slots; a worker failed to run | `references/routing.md` |
| Report content or peer communication | `references/reports.md` |
