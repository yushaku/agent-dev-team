# Matt Pocock: how they use AI coding agents (survey, 2026-11)

Question: how does Matt Pocock (TypeScript educator, author of `mattpocock/skills`) take work from idea to shipped code with coding agents, and what in it applies to this team. Primary sources are his repo (README, SKILL.md files, CHANGELOG) and his own video. The podcast is known only through the host's written summary, so those claims are marked secondary.

## Findings

1. **He encodes process as small skills, not as a framework or roles.** He rejects GSD, BMAD and Spec-Kit because they "own the process", take away control and make process bugs hard to fix. His skills are meant to be small, composable and model-agnostic, "straight from my .agents directory" [1]. In the video (about 2026-03, inferred from the cohort date he mentions) he calls agents "a fleet of middling to good engineers" with no memory, so the process must be strict [13]. There is no PM, Tech Lead or Reviewer persona in the repo. There is one human plus one agent session that loads different skills.

2. **Alignment by interview comes first, every time the change is non-trivial.** `grilling` tells the agent to interview "relentlessly", map the decisions as a design tree, and ask the whole frontier of unblocked questions per round, each with a recommended answer worded so that "yes" accepts it. Facts are the agent's job (a fresh-context sub-agent looks them up); decisions are the human's. Done only when the frontier is empty and the human confirms [5][12]. In the 2026-03 video it was one question at a time, with sessions of 16 to 50 questions and up to 30 to 45 minutes [13]. Origin: Anthropic's Thariq Shihipar (secondary, [14]).

3. **A shared glossary and ADRs live in the repo.** `grill-with-docs` updates `GLOSSARY.md` (earlier named `CONTEXT.md`) and ADRs inline. His claim: it cuts verbosity, keeps names consistent and cuts thinking tokens [1]. Other skills (`tdd`, `diagnosing-bugs`, `to-tickets`, `improve-codebase-architecture`) start by reading the glossary and the ADRs for the area [3][4][7][11]. `wait-what` re-pitches an unclear agent message in glossary terms [1][2].

4. **Spec is the destination, tickets are the journey, and the two are separate documents.** `to-spec` (was `write-a-prd`) must not interview; it only synthesizes the conversation. It picks test seams (prefer existing and the highest seam, "the ideal number is one"), has the human confirm them, and writes problem, solution, a long user-story list, implementation decisions without file paths or code, testing decisions and out of scope [6]. `to-tickets` (was `prd-to-issues`) cuts tracer-bullet vertical slices, each sized "to fit in a single fresh context window", with explicit blocking edges, and quizzes the human on granularity before publishing with `ready-for-agent` [7]. Wide mechanical refactors are the exception and use expand, migrate, contract [7].

5. **Context is managed by splitting work at the smart-zone boundary.** Grill, spec and tickets stay in one unbroken window. Each `/implement` then starts fresh from one ticket (`/clear` between tickets). `/compact` only at a phase boundary if the window nears the "smart zone" (about 150k tokens, a practitioner rule of thumb) [2]. Wayfinder tickets are sized to "one 100K token agent session" [10]. For a foggy effort too big for one session, `wayfinder` keeps a map issue (destination, notes, decisions so far, not yet specified, out of scope) and decision tickets claimed by assignment. It produces decisions, not code, and hands off to `to-spec` [2][10]. `handoff` compacts a session into a file for another session [1][2].

6. **Building is one short instruction chain: TDD, checks, review, commit.** `implement` is a few lines: use `/tdd` at pre-agreed seams, typecheck and single test files often, the full suite once at the end, run `/code-review`, commit to the current branch [8]. `tdd` says tests only at seams confirmed with the user, one vertical slice per cycle (red before green), and forbids horizontal slicing, implementation-coupled tests and tautological tests (expected value computed the way the code does) [3]. Refactoring is now outside the loop and belongs to review [3]. In the 2026-03 video, refactor was in the loop and he said agents were reluctant to refactor code still in their own context [13].

7. **Review is two axes in parallel sub-agents, run inside the implementing flow.** `code-review` diffs against a fixed point and launches Standards and Spec sub-agents in parallel "so they don't pollute each other's context". The Standards axis reads `CODING_STANDARDS.md` or `CONTRIBUTING.md` plus a Fowler smell baseline (judgement calls, repo rules win, skip what tooling enforces) [9][12]. His AFK setup adds a fresh-context automated review before human QA (secondary, [16]).

8. **Bug fixing starts with a feedback loop, never a theory.** `diagnosing-bugs`, phase 1: build one command that is red-capable, deterministic, fast and agent-runnable, ranked from failing test through curl, replay and git bisect to a human-in-the-loop script. "If you catch yourself reading code to build a theory before this command exists, stop". Then minimise; write 3 to 5 falsifiable hypotheses and show them to the user (do not block if AFK); one variable at a time with tagged debug logs; regression test before the fix only at a correct seam ("no correct seam exists" is itself a finding that hands off to architecture work); cleanup [4]. A 1.3.2 change makes the agent `diff` a forced mutation against a pristine copy so a silently failed edit cannot pass as red [12].

9. **Design quality is a recurring chore, not a one-off.** `improve-codebase-architecture` weights recently changed hot spots, uses a fresh-context explorer, applies a "deletion test", writes an HTML report of deepening candidates, then grills on the one the human picks [11]. He recommends running it every few days (README, [1]); in the video, weekly or after a feature surge [13]. `codebase-design` supplies the vocabulary (module, interface, depth, seam, adapter, leverage, locality) [1][2]. His reason: agents accelerate entropy, so codebases must be tuned for an agent that "starts afresh every single session" (host quote of Matt, secondary [14]).

10. **Planning effort scales with the cost of a wrong guess.** Secondary account of the podcast: tiny change means no grill and fix after; one session means grill; multiple sessions means wayfinder; his video editor has a feedback button that files an issue which an implement agent and a review agent pick up, and he looks only at the end [15]. He splits the day into "day shift" (human planning) and "night shift" (agents implement unattended) [14][15]. The 2026-03 video shows the same idea as a "Ralph loop" over GitHub issues: pick the next unblocked issue, implement, comment, close, next [13]. He is moving to cloud agents so they keep running with the laptop closed and can be shared [14].

11. **His view of TDD softened.** 2026-03: TDD is "the most consistent way" he improved agent output [13]. Podcast (about 2026-09, secondary): TDD fixes a human working-memory problem, agents need proof the code works "with or without TDD" [14]; Rusin's account adds "prove a change would fail without it" [15]. The 2026-11 skill still ships TDD plus the anti-tautology rule [3].

12. **Stated anti-patterns, collected.** Spec frameworks that own the process [1]. Horizontal slicing of tests or tickets [3][7]. Hypothesising before a red loop [4]. Spec files full of paths and code that go stale [6][13]. Piping a finished wayfinder map straight into `/implement` (loses the collapse step) and triaging tickets that `to-tickets` made [2]. Using the full grill on small changes [15]. Letting agents file issues in the wrong repo (his own repo got specs and tickets from agents working in clones; fixed in the tracker template) [12]. `ask-matt` was fixed to read a skill's SKILL.md before describing it, instead of trusting its own one-line summaries [12].

13. **Tools, cost and memory.** Claude Code is the primary tool; the repo ships as plugins for Claude Code, Codex and Copilot, and installs into Cursor, OpenCode, Windsurf and others via `npx skills` [1]. The tracker is the memory: GitHub issues or local `.scratch/<feature>/issues/` files [7]. His `chief-of-staff` skill keeps memory as an LLM wiki, every claim dated and every code claim citing a commit [12]. I found no dollar or token budget from him; his only numeric guidance is context size (150k, 100K per wayfinder ticket). He says he builds alone, which limits transfer to teams [15].

## Workflow

His main flow as stated in `ask-matt` [2]:

1. `/grill-with-docs` (or `/grill-me` with no repo). Human answers rounds of numbered questions; glossary and ADRs updated.
2. Optional detour: `/handoff`, `/prototype` (throwaway code), `/handoff` back, when a question needs runnable proof.
3. Multi-session build: `/to-spec`, human confirms seams; `/to-tickets`, human approves slices and blocking edges. Single-session build: skip to step 4 in the same window.
4. `/implement` per ticket in a fresh context: `/tdd` slice by slice, fast checks, full suite once.
5. `/code-review` (Standards and Spec in parallel sub-agents), then commit. The video adds a fresh-context review and human QA the next day, with QA findings filed as new tickets [13][16].
6. On-ramps: `/triage` for raw incoming issues, `/diagnosing-bugs` for hard bugs, `/wayfinder` for foggy efforts that merge back at `/to-spec`. Upkeep: `/improve-codebase-architecture` every few days.

## Against this team

Matches:
- Vertical slices with one Builder per slice, parallel Builders for independent slices, matching `to-tickets` blocking edges and the frontier idea.
- Shared `tdd`, `diagnosing-bugs`, `codebase-design`, `interview-me`; the Builder card already uses the agreed seam and keeps failing and passing output as evidence.
- Two-axis review (`## Standards`, `## Spec`) with Must fix findings; the Reviewer is a separate session, which his in-flow review is not.
- Fast check per slice, full `commands.verify` once at the end, same as `implement`.
- PO gates before build map to his human-approved spec and ticket breakdown.

Differs:
- He has no role chain (PM, Tech Lead, QA, Designer, Security, Delivery, Anti-AI). One session, skill-switched, plus sub-agents only for fact lookup and review axes. This team pays for several handoffs per Run.
- His review runs as sub-agents inside the implementing session. Ours runs as a top-tier separate session, about 26% of tokens per the dashboard figure you gave.
- He clears context per ticket and keeps state in the tracker; we use Orca worktrees and parallel Builders, which his sources do not describe (no worktree use found).
- His `to-spec` forbids interviewing and file paths; the interview is a separate human and agent step, not a PM role writing a business spec.
- He treats refactor as a review concern, not part of red-green; he skips ceremony for small changes where we scale by S0 to S3. He states no model tier routing.
- He runs unattended "night shift" loops with human QA after; our gates stop at PO approval of spec and plan.

Worth adopting:
1. **Grill in frontier rounds with recommended answers** for PM and Tech Lead discussions: number the questions, give a default, word them so "yes" accepts, and use a fresh sub-agent for repo facts. Fewer PO turns than one-at-a-time.
2. **Make the Tech Lead plan quiz the PO on seams and slice granularity before the gate**, and aim for one seam per feature (`to-spec` step 2). Add "sized to fit one fresh context window" to the slice rule.
3. **Add the tautology check to the Reviewer's test review** (expected value derived the way the code derives it), and the "diff the forced mutation against a pristine copy" step to `diagnosing-bugs` use in Builder fix rounds. Both are cheap and catch fake evidence.
4. **Keep `GLOSSARY.md` and ADRs per repo and have every role read them first.** Add a `wait-what` style rule: when the PO does not follow a report, re-pitch in glossary terms instead of re-running the role.
5. **Schedule `improve-codebase-architecture` as a periodic cheap task (fast or work tier) whose output is an HTML candidate list for the PO**, not a build. Route S3 foggy work through a wayfinder-style decision map, tickets sized to about 100K tokens, before the Tech Lead plan.
6. **Trial a lighter review on S0 and S1**: Standards and Spec as two work-tier sub-agents inside the Builder session, keeping the top-tier separate Reviewer for S2 and S3. I have no data that his version catches as much.

## Open

- No cost or token numbers from him; savings from his in-flow review versus our separate top-tier Reviewer are unmeasured.
- The podcast was read only through the host's summary and Rusin's article (both secondary); the episode date is not in the fetched text (the page cites an Aug 2026 post, so after that). The full transcript and his X thread on leaving local dev were not read.
- Whether he uses worktrees or parallel agents on one repo: not stated in anything fetched.
- The video date (about 2026-03) is inferred from a cohort start date in its description. Its text was read through a search result, not the video page.
- Skill names changed between the video and now (`write-a-prd` to `to-spec`, `prd-to-issues` to `to-tickets`, `diagnose` to `diagnosing-bugs`). The stage table in [16] is a reader's notes, seen only as a search snippet.
- The "smart zone" figure is a rule of thumb he borrows from Dex Horthy, not a benchmark.

## Sources

1. https://github.com/mattpocock/skills and raw README (repo created 2026-02-03; fetched 2026-11-19). Primary.
2. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/ask-matt/SKILL.md (fetched 2026-11-19). Primary.
3. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/tdd/SKILL.md (2026-11-19). Primary.
4. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/diagnosing-bugs/SKILL.md (2026-11-19). Primary.
5. https://raw.githubusercontent.com/mattpocock/skills/main/skills/productivity/grilling/SKILL.md (2026-11-19). Primary.
6. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/to-spec/SKILL.md (2026-11-19). Primary.
7. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/to-tickets/SKILL.md (2026-11-19). Primary.
8. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/implement/SKILL.md (2026-11-19). Primary.
9. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/code-review/SKILL.md (2026-11-19). Primary.
10. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/wayfinder/SKILL.md (2026-11-19). Primary.
11. https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/improve-codebase-architecture/SKILL.md (2026-11-19). Primary.
12. https://raw.githubusercontent.com/mattpocock/skills/main/CHANGELOG.md, version 1.3.2 (fetched 2026-11-19). Primary.
13. https://www.youtube.com/watch?v=EJyuu6zlQCg "5 Claude Code skills I use every single day" (about 2026-03, inferred; text read via search result). Primary.
14. https://newsletter.pragmaticengineer.com/p/ai-skills-with-matt-pocock (episode summary by Gergely Orosz; date not shown, after 2026-08-20). Secondary summary of a primary podcast.
15. https://blog.alexrusin.com/matt-pocock-ai-coding-workflow/ (image path dated 2026-09). Secondary.
16. https://github.com/stewdotorg/ai-swe/blob/main/reading/matt-pocock/afk-workflow/essential-skills-for-ai-coding/workflow.md (search snippet only; undated). Secondary.
