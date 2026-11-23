# Agent teams and orchestrators in practice 

Question: how do vendors, practitioners, researchers and companies run teams of coding agents with an orchestrator, and where does this team's process sit against them. All numbers are self-reported by their sources; none is independently audited.

## Findings

1. **Single agent first; split only for a reason.** Anthropic, OpenAI and LangChain all say it. The three reasons that justify a split: context pollution, parallelism, specialization [A3, O1, L2]. Teams spent months on multi-agent builds that a better single-agent prompt matched [A3].
2. **Cost multiplies.** 3 to 10x tokens in general and 15x for research [A2, A3]; a generator + evaluator harness cost $200 over 6 h against$9 over 20 min solo [A5]; 3.5 to 14.8x on coding benchmarks [R4].
3. **Read in parallel, write in one thread.** Research, exploration and review parallelize well; parallel writers on shared code fail [A2, A6, C2, L1]. Merged-PR rate fell as agents grew from 10 to 80 [A6].
4. **Generator + verifier is the most used pattern.** The reviewer works best with a clean context, not the builder's [C2]. A verifier with no explicit criteria rubber-stamps [A4].
5. **The gain from role teams shrinks as models improve.** MetaGPT over a single agent: +10.7 pts with GPT-3.5, +3.0 with Gemini 2.0 Flash [R4]. Coordination turns negative once the single agent scores above about 45%, and sequential tasks lose up to 70% [R3]. Handoff chains (planner, executor, reviewer) lose context at every handoff [A3]. ChatDev scored 33% on an independent re-run; most failures are design and verification issues [R2].
6. **No company in a primary source runs a PM → Tech Lead → Builder chain in production.** All use one agent per task, many tasks in parallel, inside a deterministic workflow:
   - Stripe Minions: an agent per devbox, "blueprints" mixing agent steps with fixed steps (lint, push), at most 2 CI rounds then back to a human; 1,300+ merged PRs a week, every one human-reviewed [S1].
   - Spotify Honk: verifiers must pass before a PR opens; an LLM judge compares the diff to the prompt and vetoes about 1 in 4 sessions for scope creep [S2].
   - Ramp Inspect: sandbox VM per session, self-checks with tests and screenshots; about 30% of merged PRs [S3].
   - Airbnb: a per-file state machine that calls the LLM only when a step fails; 3.5K files in 6 weeks, the last 3% done by hand [S4].
7. **Practitioners keep the human as top orchestrator** [P2, P4, P5, P6]. Only Yegge hands orchestration to an agent (Gas Town "Mayor"); he calls it flaky and very expensive, merged 44k unreviewed lines, and his watchdog agent killed healthy workers [P1].
8. **Recurring practices:** a human-approved plan before code; a worktree or sandbox per agent; hooks that run lint and tests; 3 to 5 agents at once (3 focused beat 5 scattered) [P3]; a retry cap (8 iterations [P3], 2 CI rounds [S1]); every mistake becomes a durable rule in AGENTS.md or CLAUDE.md [P5, P6, P7]. Review throughput is the bottleneck [P2].

## Against this team

- **Matches:** PO gates; sizing (not every job runs the full team); one Builder per worktree; reviewers separate from the Builder; lessons kept as rules.
- **Differs:**
  - The sequential PM → Tech Lead → Builder chain is the handoff pattern [A3] warns about. Defensible for S3 where the PO approves a spec; questionable for S1 and S2.
  - An agent Orchestrator is the least common setup [P1]; PO gates make it safer than Gas Town.
  - Missing: deterministic checks in code instead of agent self-assessment [S1, S4], and a scope-creep check of the diff against the spec [S2].

## Open

- Use this note to audit each size S0 to S3 (which steps to drop or replace with fixed checks), or keep it as reference only.

## Sources

- A1 [https://www.anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents)
- A2 [https://www.anthropic.com/research/multi-agent-research-system](https://www.anthropic.com/research/multi-agent-research-system)
- A3 [https://claude.com/resources/articles/building-multi-agent-systems-when-and-how-to-use-them](https://claude.com/resources/articles/building-multi-agent-systems-when-and-how-to-use-them)
- A4 [https://claude.com/resources/articles/multi-agent-coordination-patterns](https://claude.com/resources/articles/multi-agent-coordination-patterns)
- A5 [https://www.anthropic.com/research/harness-design-long-running-apps](https://www.anthropic.com/research/harness-design-long-running-apps)
- A6 [https://www.anthropic.com/research/multiagent-systems](https://www.anthropic.com/research/multiagent-systems)
- A7 [https://code.claude.com/docs/en/agent-teams](https://code.claude.com/docs/en/agent-teams)
- O1 [https://developers.openai.com/api/docs/guides/agents/orchestration](https://developers.openai.com/api/docs/guides/agents/orchestration)
- O2 [https://developers.openai.com/codex/subagents](https://developers.openai.com/codex/subagents)
- C1 [https://cognition.com/blog/dont-build-multi-agents](https://cognition.com/blog/dont-build-multi-agents)
- C2 [https://cognition.com/blog/multi-agents-working](https://cognition.com/blog/multi-agents-working)
- L1 [https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)
- L2 [https://www.langchain.com/blog/choosing-the-right-multi-agent-architecture](https://www.langchain.com/blog/choosing-the-right-multi-agent-architecture)
- M1 [https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/magentic](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/magentic)
- R1 MetaGPT [https://arxiv.org/abs/2308.00352](https://arxiv.org/abs/2308.00352) ; ChatDev [https://arxiv.org/abs/2307.07924](https://arxiv.org/abs/2307.07924)
- R2 MAST [https://arxiv.org/abs/2503.13657](https://arxiv.org/abs/2503.13657)
- R3 Scaling agent systems [https://arxiv.org/abs/2512.08296](https://arxiv.org/abs/2512.08296)
- R4 Single or multi-agent [https://arxiv.org/abs/2505.18286](https://arxiv.org/abs/2505.18286)
- R5 Agentless [https://arxiv.org/abs/2407.01489](https://arxiv.org/abs/2407.01489)
- R6 Agyn [https://arxiv.org/abs/2602.01465](https://arxiv.org/abs/2602.01465)
- S1 Stripe [https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2)
- S2 Spotify [https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3)
- S3 Ramp [https://builders.ramp.com/post/why-we-built-our-background-agent](https://builders.ramp.com/post/why-we-built-our-background-agent)
- S4 Airbnb [https://airbnb.tech/infrastructure/accelerating-large-scale-test-migration-with-llms/](https://airbnb.tech/infrastructure/accelerating-large-scale-test-migration-with-llms/)
- P1 Yegge [https://yegge.ai/essays/gas-town-emergency-user-manual/](https://yegge.ai/essays/gas-town-emergency-user-manual/)
- P2 Willison [https://simonwillison.net/2025/Oct/5/parallel-coding-agents/](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)
- P3 Osmani [https://addyosmani.com/blog/code-agent-orchestra/](https://addyosmani.com/blog/code-agent-orchestra/)
- P4 Cherny [https://www.infoq.com/news/2026/01/claude-code-creator-workflow/](https://www.infoq.com/news/2026/01/claude-code-creator-workflow/)
- P5 Hashimoto [https://mitchellh.com/writing/my-ai-adoption-journey](https://mitchellh.com/writing/my-ai-adoption-journey)
- P6 Every [https://every.to/guides/compound-engineering](https://every.to/guides/compound-engineering)
- P7 Huntley [https://ghuntley.com/loop/](https://ghuntley.com/loop/)