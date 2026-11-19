# Lauren Tan (poteto): how she uses AI coding agents (survey, 2026-11)

Question: how does Lauren Tan run coding agents (verification, skills, enforcement, parallelism, review, cost), and what does this team gain from it. Claims are her own and self-reported; PR counts are not audited.

## Identity and sources

- **Identity is confirmed, affiliation is moving.** GitHub `poteto` ("lauren"), X `@poteto` (not `@potetotes`; the "e" spelling is in her own talk: "potato with spelled with an E" [1]). React Compiler core team member, ex-Netflix, ex-Meta [1][4]. The GitHub bio now says "Software Engineer @xai-org & @react compiler core team" [5]. In Aug 2026 she said she had been at Cursor about 5 months [1]; in Nov 2026 the AI Engineer listing says "SpaceXSI" and she works on Grok Bot [2][4]. Workshop and Cursor plugin claims below date from the Cursor period; the 11,000 PR claim is from the later lab.
- **Primary sources found and fetched:** workshop transcript [1], conference talk page [2], `pstack` README [3], her repos `noodle` [6], `brainmaxxing` [7], `verification-skill-example` [8], GitHub profile [5], conference bio [4].
- **Not found:** `poteto/dotfiles` and `poteto/pstack` return 404 (pstack lives in `cursor/plugins`). No personal agent config repo located. Her blog (no.lol) and X threads are referenced by [4] but were not fetched; her Nov 2026 talk transcript was not fetched, only its description [2].
- **Secondary (not her words):** [9] skills.sh listing, [10] Superbash article, [11] rat-stack notes. The Superbash piece itself says viral captions about "50+ agents", "Chief of Staff" hierarchies and salaries are not in her workshop [10]. Ignore those.

## Findings

1. **Verification is the first skill, not the last.** She says "the most important skill ... is verification": the agent must run the app, take CPU traces and heap snapshots, or open a simulator. It "doesn't guarantee your agent writes good code" but gives correct code [1] (2026-08). Without it "you are the verifier ... the bottleneck", so you cannot parallelize [1].
2. **A project-local verification skill plus a feature map.** `control-glass` drives a dev build over Chrome DevTools Protocol. The feature map tells the agent how a user reaches each feature, shortcuts, and CDP selectors, so a vague bug report or bare screenshot becomes actionable [1]. The example repo has about 30 feature files, one per area, each answering: what exists, how a user reaches it, how to drive it, what usually lies [8]. Her stated reason against a wiki: "Agents pay for every token they reread" [8]. Skills `create-verification-skill` and `maintain-verification-skill` generate and fix drift in the map [3].
3. **Skills grow from observed failures, not from design.** She never "set out to build pstack"; each time she saw a failure mode (guessing, not reading code, confident false root cause) she wrote a skill [1] (2026-08). She read tool calls and thinking blocks to find them [1]. The `/correct` skill mines history for repeated mistake classes and fixes each at the highest level that works: architecture, then types, lint and CI, then tests, docs last [3].
4. **Skills get evals, and the eval is blinded.** "Evals are a way to unit test your skills." A coordinator writes a rubric; subagents run in neutrally named directories (agents change behavior when they know they are tested); a judge of a different model cross-checks; `/loop` repeats until 10/10; the same skill is evaluated across models [1]. Shipped as the `eval` playbook [3].
5. **Enforcement beats instruction.** Five layers from soft to hard: style guide, skills, rules/Bugbot, static analysis (lint, compiler, CI), codebase architecture. Soft layers "can still forget"; only the last two make CI red [1]. Rule of thumb: if you enforce an invariant by commenting on a PR, "consider that as a code smell ... how do I turn this into a lint rule? ... a CI failure?" [1]. Examples: `useEffect` banned, code comments banned (agents write stale history comments), an import check that blocks renderer/main-process crossings [1][4].
6. **Make the shortcut the right path.** Design principle: "the shortest path is the best path", because agents copy existing patterns and take shortcuts. Co-locate a feature in one directory so the agent does not grep around [1]. Greenfield, fully vibe-coded code with no guardrails is "the biggest risk"; brownfield code with strong conventions is already in good shape [1]. She spent 600+ PRs refactoring Grok Bot into this architecture before trusting autonomy [1].
7. **Trust is a curve, and you cannot skip it.** Low trust means micromanaging one to a few agents; she says you cannot spawn 100 agents when you do not trust one, and doing so "wastes a lot of tokens" [1]. Her path: verification locally, then cloud agents, then auto-merge and "reviewing them on main". Reported: about 1,000 PRs in one month and about 20 landing overnight (Aug 2026) [1]; 11,000 PRs in one month with about 0.5% revert rate at the Grok Bot team (Nov 2026, talk description) [2]. She says she no longer reads the code in Grok Bot, only after the constraints exist [1].
8. **Start local, then move proven loops to cloud agents.** "The best place to start is local because you can observe" [1]. After that she is "mostly all in on cloud agents". The Benny automation takes Slack bug reports, boots a cloud desktop, drives the app with the same control skills, and reports reproduced, or "already fixed on main" [1][3].
9. **`/poteto-mode` is a router into 23 playbooks.** It matches the task to a playbook (investigation, bug fix, perf, feature, refactor, prototype, eval, babysit, shipping, autonomous run, orchestrate, autopilot-full, and others), copies its steps verbatim into a todo list, and calls other skills as needed. Every playbook ends with "opening a PR" [3]. Works with `/loop` "for many hours" [3].
10. **Parallelism is per task and read-heavy; writers are isolated.** `/swarm` runs N workers across different slices then one report; `/arena` runs N attempts at the same task and merges the best parts; `/interrogate` has different models try to break a diff [3]. `autopilot-full` gives "one owner per pr" and a swarm verifies each code-ready head; any later change to the patch gets a fresh check [3]. She asks agents to split work into small atomic PRs so history stays useful and reverts are easy; no hard size cap, 50 to about 1,000 lines [1].
11. **Models are split by strength.** pstack defaults: code delegates (feature, refactor, bug fix, perf, hillclimb) go to Grok, hardest changes, prose and judgment go to Opus 5.5; `/setup-pstack` writes per-role model choices (to `~/.claude/rules/pstack-models.md` for Claude Code) [3]. It also ships a Claude Code adapter that skips Cursor-only steps with a note [3].
12. **Memory is a markdown vault plus reflection.** `brainmaxxing` (created 2026-02-27): the agent reads a `brain/` folder at session start and writes to it; `/reflect` after sessions ("alone gets you most of the value"), `/ruminate` over past conversations, `/meditate` to audit and prune; hooks inject and rebuild the index [7]. `noodle` (created 2026-02-22) is a Go orchestrator where a `schedule` frontmatter field makes a markdown skill autonomous, with schedule and execute skills as the minimum loop [6][11]. Both are early 2026 work on Claude Code; pstack (May 2026) is the later, Cursor-centred form [4][7].
13. **Cost: she is explicit it is expensive and she has no cap.** "I work at an AI lab where we have unlimited tokens"; the upfront spend (refactor, evals) is an ROI question for others [1]. She stresses this is the reason not to scale agents before trust exists [1].
14. **Humans stay in at three points.** Building and tuning skills (be "a backseat driver", read every tool call early) [1]; reviewing Benny-style proposed fixes from non-engineers [1][10]; the constraint design itself. Her management analogy: the engineer becomes a head chef who designs the kitchen [1]. `/show-me-your-work` logs decisions to a committable TSV for review after an unattended run [3].
15. **Stated anti-patterns.** Agents that guess root causes without reading code; being "the verifier" by hand; relying only on rules, skills and Bugbot; comments encoding PR chatter; timers added to paper over React/VS Code mismatches, then copied by other agents [1][4]; jumping to many agents before trust; fully vibe-coded greenfield ("organic architecture") [1]; throughput without quality: "i don't want to ship like a team of twenty slop artists" [3].

## Workflow

Reconstructed from [1][3][4]; she does not publish one fixed idea-to-ship list.

1. Frame the task and start `/poteto-mode`; it picks a playbook. `/in-your-own-words` or `/sharpen` can restate or deepen a prompt first [3].
2. Investigate read-only (`/how`, `/why`, subagents) before changing code; no guessing [1][3].
3. For crossing function boundaries, settle caller usage and types first (`/architect`); for multi-phase work, a multi-phase plan with stacked PRs [3].
4. Reproduce, then fix, using the project verification skill against a running build; prefer failing test first (`/tdd`) when a cheap path exists [3].
5. Machine checks: lint, types, import-boundary CI, Bugbot [1].
6. Independent attack on the diff by other models (`/interrogate`), then `/unslop` and `/no-comments` [3].
7. Open a PR from small ordered commits; babysit CI and threads; the shipping playbook independently verifies a green stack then lands it bottom-up [3].
8. After the run: `/reflect` to capture the recipe, `/correct` to turn repeated corrections into a hard check [3].
9. Human reviews on main or at the stack, with evidence artifacts, once trust is earned [1].

## Against this team

**Matches**
- Separate-session reviewer with independent models, and "read the tests first"; our Reviewer card already tags `mechanical` findings that a lint, type rule or CI job could catch [T roles/reviewer.md], which is her "turn it into a lint rule" idea.
- Evidence over claims: our Builder reports link execution evidence, Reviewer rejects a diff that weakens a test or lint rule [T].
- One owner per unit of work, parallel only for independent slices; per-task worktrees [T, 3].
- Skills as the context carrier, shared across agents (`~/.agents/skills`), and small scoped skills [T, 8].

**Differs**
- She has no PM, Tech Lead or per-role hand-off chain; one agent per task is routed by a playbook, with a swarm for verification. We use a role chain with PO gates. Her scale (about 20 PRs overnight) depends on a codebase that already rejects bad changes; our gates substitute for that [1][T].
- Her end state is auto-merge with no pre-merge human review; ours ends at a draft PR with PO acceptance [1][T].
- Verification is the center of her system (feature map, drive the real app, blinded evals of the skill). Ours centers on role separation, with QA a later role and "visual loop" opt-in per Task [T roles/builder.md].
- She treats skills as code with tests (eval playbook). Our pinned skills are "never edited in place" and are not evaluated [T README.md].
- Tokens: she has none of our constraint. Our dashboard shows Reviewer about 26%, Builder about 46%, and the Orchestrator costing more than the workers it runs [T research/our-data.md]; her model puts cost in the upfront architecture and verification, not in supervision.

**Worth adopting (concrete)**
1. **Per-repo feature map plus verify skill.** Have `/init-team` or a Tech Lead task create `.team/verify/` (or a repo skill) with a feature-per-file map and a drive script; the Builder runs it before reporting, QA reuses it. Start with one feature area, like [8].
2. **Make "mechanical" findings a work item.** When the Reviewer tags `mechanical`, the Orchestrator opens a small Task to add the lint, type or CI rule, with the failing case as a test. Track count of repeat findings per rule; the goal is the same class never reaching review twice [1][3].
3. **Eval our own role cards and skills.** For a changed role card, run a blinded rubric eval on 3 fixtures (broken, working, blocked) and a held-out case; treat BLOCKED as a valid verdict [1][10]. Cheap tier for workers, a different model as judge.
4. **Let the Reviewer run an adversarial multi-model pass only on S2 and S3,** and make Reviewer rubber-stamping visible by requiring one runnable check per finding set [3].
5. **Ban or constrain shortcut-prone patterns per repo in `config.md`** (comments, effects, cross-boundary imports) and enforce in CI, not in the Builder card; keep the Builder card for process only [1].

## Open

- Her Nov 2026 talk (11,000 PRs, 0.5% revert rate, TLA+ and Lean formal verification) was read only from its description [2]. A transcript would show how a revert is defined and what "PR" covers.
- Whether any personal dotfiles or global agent config is public is unknown; `poteto/dotfiles` 404s, and her X threads and blog were not fetched.
- Affiliation naming (Cursor, xAI, SpaceXAI, SpaceXSI) varies by source; treat employer as unverified [5][10].
- Her PR figures overlap (monthly, overnight, refactor PRs) and are self-reported.
- She worked with lab-level token budgets and a codebase she could restructure; effect size for a small team on a legacy repo is untested.

## Sources

1. Lauren Tan workshop video and transcript, YouTube `Zc07HI9Ppxk`, listed 2026-08-26. https://www.youtube.com/watch?v=Zc07HI9Ppxk (primary)
2. "All Code Is Slop (Except Mine)", AI Engineer, 2026-11-14 (description and timestamps only). https://www.youtube.com/watch?v=O_zcc6Xl12g (primary, partial)
3. pstack README, cursor/plugins. https://github.com/cursor/plugins/tree/main/pstack (primary, undated; added May 2026 per [4])
4. Lauren Tan speaker bio, AI Engineer. https://ai.engineer/speakers/lauren-tan (conference page, 2026)
5. GitHub profile. https://github.com/poteto (primary, fetched 2026-11)
6. poteto/noodle, created 2026-02-22. https://github.com/poteto/noodle (primary)
7. poteto/brainmaxxing, created 2026-02-27. https://github.com/poteto/brainmaxxing (primary)
8. poteto/verification-skill-example, created 2026-07-30. https://github.com/poteto/verification-skill-example (primary)
9. skills.sh listing of poteto skills. https://www.skills.sh/poteto (secondary)
10. Superbash, "Lauren Tan's AI Coding Agents Workflow: Trust Comes First", 2026-10-28. https://www.superbash.ai/articles/lauren-tan-ai-coding-agents-trust-curve/ (secondary)
11. rat-stack, "Lauren Tan's skills", edited 2026-10-24. https://ratstack.sh/lore/lauren-tan-skills (secondary)

T: this team's own files (`README.md`, `workflow.md`, `roles/builder.md`, `roles/reviewer.md`, `research/our-data.md`), read 2026-11-19.
