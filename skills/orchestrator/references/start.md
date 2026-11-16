# Start and coordinate

## Preflight

1. Identify the repo and read `.team/config.yaml` (`config.md` defaults when absent). Resume the Run the PO names; otherwise match its objective and handoff. Ask only when the repo, scope or source branch remains ambiguous. Preserve uncommitted user work.
2. Read the relevant request/ticket, `todo.md`, carry-over and research notes it names. Choose the team below; resolve only its role skills and project slots. Report missing required skills once.
3. Select agents through `coding-agents.md`. Use the version-matched Orca guides for Run/workspace creation, dispatch and receipts; resume existing work before creating more state.
4. For code changes, use a feature worktree from the configured base or PO-named branch. Link `.team` and each `worktree_links` path to its main-checkout counterpart (one shared `.team/` per repo); follow install/verify commands and `serial`. Keep baseline failures distinct from regressions.

## Team decisions

- Default: one Builder owns diagnosis, implementation, tests, relevant measurements, related docs and delivery; one independent Reviewer checks the result.
- Before adding a worker, name the question/evidence it supplies and why existing workers cannot cover it. Risk-triggered checks still run; they need not be separate workers. The Orchestrator selects the roster without another PO gate.
- New or changed business rules need a spec and Gate 1. The Builder can author it; add a Tech Lead for unresolved requirements or design. New screens follow G-UI and `ui_rules`; delivery and tickets keep their gates (`gates.md`).
- Architecture impact without an accepted ADR (external vendor/system, data store, deployment topology, load target or personal-data boundary): ask the PO for a Solution Architect session before planning.
- Read-only questions may use one Investigator without a Run/worktree. Respect `flow.max_concurrent_agents`; parallel work needs disjoint ownership or isolated workspaces and an integration owner.
- PO roster overrides apply. Ignore legacy `flow.default_size` and `flow.max_size`.

## Dispatch and follow-ups

- Use `specs.md` for Task inputs and dashboard metadata. Dispatch through `orchestration`, then end the turn; Orca wakes you. Follow the receipt's `next`. With `serial: true`, only one worker runs verify at a time.
- Send follow-ups to the existing Dispatch; preserve round metadata and use the receipt's Task identity. Keep sessions open only when the PO will keep using them.
- At handoff, or when HEAD changes unexpectedly, compare the reviewed revision with the current branch. Preserve PO edits; redirect affected workers to the new revision and review only what changed.
- A missing report gets a follow-up asking the same worker to supply it. A commit hash alone is not completion evidence.
- Before retry, stop, release or reassignment, load the version-matched recovery/cleanup reference. Preserve Task identity and retry limits. Silence and uncertain liveness do not prove failure.
- Report confirmed permission blocks with the exact command; follow `coding-agents.md` "Permission prompts". Never change global agent permissions automatically.

## Board mapping

- One feature worktree; use a Run when dependencies or several Tasks need tracking. Link the ticket/PR to the workspace.
- Started = `in-progress`; delivered with Gate 2 pending = `in-review`; merged = `completed`.
- No-code production investigations read the configured `branches.client_visible` remote ref, not an unrelated working tree.

Evaluate the default over the next three delivered changes using existing reports: Task count, elapsed time, PO interventions and post-delivery defects. Fewer Tasks alone is not success.
