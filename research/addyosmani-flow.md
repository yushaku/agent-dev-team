# Addy Osmani: how they use AI coding agents (survey, 2026-11)

Question: how does Addy Osmani (Google Chrome engineering lead, author of the `agent-skills` repo and of the "AI-assisted engineering" writing) run coding agents from idea to ship, and what from it fits or conflicts with this team's process. All claims come from pages fetched for this survey; his numbers are self-reported.

## Findings

1. **He is a spec-first, human-accountable "AI-assisted engineer", not a vibe coder.** He describes his method as AI-augmented engineering rather than AI-automated engineering, and says he stays "proudly accountable" for what ships (Jan 4, 2026) [1]. He treats the LLM as a pair programmer that needs direction, context and oversight, and reads every output like a junior's code [1].
2. **The spec comes before code, and the AI helps write it.** He asks the model to interview him until requirements and edge cases are covered, compiles `spec.md` (requirements, architecture decisions, data model, testing strategy), then has a reasoning model turn it into a plan of small tasks, iterating on the plan before any code (Jan 4, 2026) [1]. His spec guide (Jan 13, 2026) adds: start from a high-level brief, use read-only Plan Mode, save the approved spec as a file that survives restarts, and keep it small enough to stay inside the model's attention budget [2]. The `agent-skills` spec skill formalizes this as gated phases Specify, Plan, Tasks, Implement, with a human review after each; the turn must end after the spec is saved, and approval comes in a later turn [3][4].
3. **Spec content is a fixed six-area template.** Objective, commands (full runnable commands), project structure, code style (one real snippet beats prose), testing strategy, and a three-tier Boundaries list (Always / Ask first / Never) [4]. The skill requires the agent to list its assumptions out loud before writing and to include a Phase 0 "capability map" when one request bundles several independently testable capabilities [4].
4. **Work is cut into small iterative chunks, one at a time.** "Implement Step 1 from the plan", test, then Step 2; big monolithic asks produce inconsistent code "like 10 devs worked without talking" (his paraphrase of a cited developer) (Jan 2026) [1]. This pairs with tests per slice and a commit after each small task, treated as save points; he does not commit code he cannot explain [1].
5. **Context is packed deliberately, and he changed his mind on AGENTS.md.** In Jan 2026 he recommends a "brain dump" of goals, invariants, good examples and known bad approaches, docs pasted in or via an MCP such as Context7, and skills as durable reusable instructions [1]. By Feb 23, 2026 he argues against `/init`-generated AGENTS.md: two early-2026 papers he cites show LLM-written context files lowering success by 2 to 3% and raising cost by over 20%, while human-written files with non-discoverable facts (tooling gotchas, landmines) help [5]. His model: AGENTS.md is a living list of codebase smells you have not fixed, and large repos want a hierarchy of per-module files, not one root file [5]. The same file is the "compound learning" store updated at each retro [6].
6. **Single main agent for most work, many agents for the right work.** In Jan 2026 he says he usually runs one main agent plus a second one for review, and that "massively parallel" runs are effective but mentally taxing [1]. Later that month his setup is four to five background agents on low-to-medium complexity work, plus three to five local human-in-the-loop sessions for architecture and product nuance (Jan 8, 2026) [7]. Mar 26, 2026: "most developers are stuck at level 3 to 4" of an eight-level ladder (a framework from Steve Yegge, secondary within his post), and he teaches the shift from "conductor" (one agent, synchronous) to "orchestrator" (many agents, async) [6].
7. **The multi-agent ladder is subagents, then Agent Teams, then worktrees and gates.** Subagents first (parent decomposes, each child writes a report file, the parent manages the dependency graph by hand, roughly cost-neutral at about 220k tokens in his demo); Agent Teams when coordination becomes the bottleneck (shared task list, peer messaging, file locking); hierarchical "feature lead" subagents to keep the top context clean [6]. Isolation is by git worktree; the rule is "one file, one owner" [6].
8. **Parallelism is capped by review capacity, with explicit limits.** WIP limit of 3 to 5 agents ("don't run more agents than you can meaningfully review"), check-ins every 5 to 10 minutes, kill an agent stuck 3+ iterations on the same error; a loop guardrail of `MAX_ITERATIONS=8` plus a forced reflection prompt before each retry ("what failed, what change would fix it, am I repeating myself") [6]. "Verification is the bottleneck, not generation" [6]. Three to five teammates is the sweet spot because token cost scales linearly with team size [6].
9. **Delegation is by brief, and humans keep the judgment calls.** A brief has outcome, context, constraints, non-goals, acceptance criteria, integration notes (files off limits) and a verification plan; point agents at existing files to imitate [7]. Over-delegating product intent, API tradeoffs and architecture boundaries is named as a trap. Local human-in-the-loop sessions handle architecture and ambiguity; cloud or background sessions handle bounded tasks: migrations, test generation, docs, dependency bumps, small fixes [7]. Plan approval is required for risky teammate tasks [6].
10. **Verification is tests plus a second reviewer plus live evidence.** Agents "fly" only when a real test suite exists; without it they claim all is fine. He instructs the agent to run tests after each task and fix failures [1]. He routinely has a second session or different model critique the first (Claude writes, Gemini reviews) [1]. He uses Chrome DevTools MCP to give the agent DOM, console, network and performance traces for UI debugging [1]. In the team pattern a dedicated `@reviewer` teammate auto-triggers on every task completion, and hooks run tests on task completion, so the lead sees only reviewed code [6].
11. **The 70% problem is the core argument for all of the above.** AI delivers a plausible first 70% fast; the remaining 30% (edge cases, races, accessibility, security, integration) takes longer than the first 70% and needs human judgment; better prompts and specs push to maybe 80 to 85% [8]. First stated Dec 2024 (listing date for the Substack post) with the "two steps back" pattern, where each AI fix breaks something else [9]. Effort shifts from writing to reviewing and testing [8]. He also states the knowledge paradox: AI helps seniors more than juniors [9].
12. **His agent-skills repo is the packaged version of the lifecycle.** Created 2026-02-15; 25 skills and 9 slash commands mapping DEFINE, PLAN, BUILD, VERIFY, REVIEW, SHIP (`/spec`, `/plan`, `/build`, `/test`, `/constraints`, `/review`, `/webperf`, `/code-simplify`, `/ship`), installable into Claude Code, Cursor, Codex, Copilot, Gemini CLI and others; skills auto-activate by task; `/build auto` generates the plan and implements all tasks in one approved pass, still test-driven and committed per task, pausing on failures or risky steps [10]. At fetch time it showed 118,653 stars.
13. **Tools: model-agnostic, CLI-first, and he names his bias.** Claude Code, Codex CLI, Gemini CLI, Cursor, Jules, Copilot coding agent, Conductor (worktree manager) [1][6]. He says he gravitates toward Gemini and discloses that he works on Gemini at Google [1]. He recommends using the best "pro" tier model, trying another model when one is stuck, and paying for it because productivity can justify cost [1].
14. **Cost views are about overhead, not budgets.** Context files add 15 to 20%+ cost per run and compound across CI runs [5]; team token cost is linear in headcount [6]. He gives no per-role token split or dollar budget in anything fetched.
15. **Stated anti-patterns.** Skipping the spec; big monolithic prompts; auto-generated AGENTS.md; more agents than you can review; two agents on one file; unattended full-feature runs ("not at the stage" of trusting them); never committing code you cannot explain; relying on AI without periodic coding by hand to keep skills sharp [1][4][5][6]. Spec red flags in the skill: spec and plan written in the same turn, V1 growing mid-build, architecture decided without a record [4].
16. **How his view moved.** Dec 2024: diagnosis (70% problem, bootstrappers vs iterators) [9]. Jan 2026: one main agent plus a reviewer, parallelism is taxing [1]. Jan 8, 2026: 4 to 5 background plus 3 to 5 local sessions, "manager skills" framing [7]. Feb 2026: factory model (build the factory that builds the software; three generations: autocomplete, synchronous agents, autonomous agents running hours to days) [11], and a reversal on auto-generated AGENTS.md [5]. Mar 26, 2026: formal orchestration patterns, WIP limits, quality gates [6].

## Workflow

His flow, as stated across the sources:

1. **Idea:** short brief; the agent interviews him (skill `interview-me` in the repo) and lists assumptions [1][4][10].
2. **Spec:** `SPEC.md` in the repo with the six areas and Always/Ask first/Never boundaries; read-only Plan Mode; human approval in a separate turn [2][4].
3. **Plan and tasks:** small atomic tasks with acceptance criteria and a testing plan; plan critiqued by the AI, then approved [1][4].
4. **Build:** one slice at a time, test-driven, commit after each; single agent locally for hard work, background agents for bounded tasks, subagents or Agent Teams in worktrees when slices are independent (one file, one owner) [1][6][7].
5. **Verify:** tests on each task, loop guardrails, DevTools evidence for UI, hooks that run tests on completion [1][6].
6. **Review:** a second agent or model reviews, a `@reviewer` teammate gates every task, then he reads and understands the diff himself [1][6].
7. **Ship:** `/ship`, human merge decision; he only ships code he understands [1][10].
8. **Retro:** update AGENTS.md with non-discoverable gotchas, prune the rest [5][6].

## Against this team

**Matches**
- Spec and plan before code, approved by a human at a gate, with the spec saved as a file [2][4]. This team's Tech Lead spec/plan plus PO gates is the same shape.
- Small vertical slices, one Builder per slice, tests first (the `tdd` skill) [1].
- Separate-session Reviewer with a spec axis and a standards axis; his second-model review and `@reviewer` gate are the same idea [1][6].
- Worktree isolation, one owner per file, parallel only for independent slices (`start.md` "Parallel Builders") [6].
- Local human-in-the-loop for judgment, background agents for bounded work: maps to PO gates vs `fast`/`work` tiers [7].
- Skills as durable instructions, shared across agents [1][10].

**Differs**
- He caps parallelism at 3 to 5 agents by review capacity and runs mostly one main agent; this team's default is Builder plus Reviewer and adds specialists, so the cap is only implicit in the S0 to S3 sizing [1][6].
- He puts the approval of the spec in a separate turn from writing it; this team has a PO gate but no stated rule about ending the turn after the spec is saved [4].
- He gives numeric stop rules (stuck 3+ iterations, `MAX_ITERATIONS=8`, forced reflection); the team docs read in this survey do not state an iteration cap for fix rounds (check `review.md` before adopting) [6].
- He says auto-generated AGENTS.md hurts and context should be non-discoverable facts only; this team's role cards and skills are the context carriers and carry their own cost [5].
- His review is largely himself plus one AI; the team's top-tier Reviewer absorbs about 26% of tokens by our own dashboard, a cost he never discusses [1].
- The team removed his `spec-driven-development`, `planning-and-task-breakdown` and `incremental-implementation` as overlapping; his own repo treats them as a gated chain, so removing them is consistent only if the Tech Lead card covers the same gates [4][10].

**Worth adopting**
1. **Assumptions list at the start of spec work:** the Tech Lead (or PM) writes "ASSUMPTIONS I'M MAKING" before the spec body; the PO corrects at Gate 1 [4]. Cheap, and catches the most dangerous misunderstandings.
2. **Boundaries tiers (Always / Ask first / Never) in each Task spec:** map "Ask first" to Orchestrator escalation to the PO, and "Never" to Reviewer Must fix; this extends the existing rule on weakened tests and lint [4].
3. **Loop guardrail with forced reflection:** after N failed fix rounds (his 3 same-error kill rule, 8 hard cap), the Builder must write what failed and whether it is repeating itself, and the Orchestrator reassigns rather than retries [6].
4. **WIP limit tied to review capacity:** cap concurrent Builders at 3 to 5 per PO or Reviewer capacity; the Reviewer is the bottleneck by his account and by our token split [6].
5. **Prune context files:** audit `.team/config.yaml`, AGENTS.md and role cards for discoverable content; keep only gotchas, and add a retro step that deletes lines as well as adds them [5].
6. **Reviewer on a different model family than the Builder where possible:** the Reviewer card allows the same provider; his cross-model review (and "model musical chairs" when stuck) suggests making different-family the default for top-tier review of risky slices [1].

## Open

- The `/build auto` skill (single approved pass, per-task commits, pause on risk) was read only from the README summary; the per-skill text for `incremental-implementation`, `context-engineering`, `test-driven-development` and the code-review skill was not fetched here.
- No fetched source gives dollar or token budgets, a per-role split, or measured success rates for his own workflow; the numbers in findings 5 and 14 are from papers he cites, not his data.
- His talks (O'Reilly CodeCon deck, Speakerdeck, GitNation) and X threads were seen only as search listings, not fetched, so no claims rest on them.
- Whether Agent Teams (experimental flag) remains the right primitive versus Orca worktrees is untested; this team already has a dispatcher that replaces it.
- His Gemini preference is disclosed as biased; treat his tool rankings as weak evidence.

## Sources

All primary (his own site, Substack or repo) unless marked secondary. Fetched during this survey.

1. https://addyosmani.com/blog/ai-coding-workflow/ (Jan 4, 2026; first on Substack Dec 18, 2025)
2. https://addyosmani.com/blog/good-spec/ (Jan 13, 2026)
3. https://github.com/addyosmani/agent-skills/blob/main/skills/spec-driven-development/SKILL.md (undated, fetched Nov 2026; same file as [4])
4. Same SKILL.md content, sections "The Gated Workflow", Phase 0 to Phase 1, Red Flags, Verification (fetched Nov 2026)
5. https://addyosmani.com/blog/agents-md/ (Feb 23, 2026; cites two papers, secondary for the study numbers)
6. https://addyosmani.com/blog/code-agent-orchestra/ (Mar 26, 2026; the Yegge levels are secondary)
7. https://addyosmani.com/blog/coding-agents-manager/ (Jan 8, 2026; Boris Cherny and Simon Willison points are secondary)
8. https://addyosmani.com/agentic-engineering/the-70-percent-problem/ (undated glossary entry, fetched Nov 2026)
9. https://addyo.substack.com/p/the-70-problem-hard-truths-about (Dec 4, 2024 per search listing)
10. https://github.com/addyosmani/agent-skills (README; repo created 2026-02-15; 118,653 stars at fetch, Nov 2026)
11. https://addyosmani.com/blog/factory-model/ (Feb 25, 2026; builds on a Michael Truell post, secondary for that part)
