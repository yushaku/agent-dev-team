# Project config

Schema, defaults and overrides for Orchestrator and `init-team`. Platform starting values live in `skills/init-team/references/platforms.md`. Dispatched workers receive resolved values in their Task.

## Resolution

- Lookup: `.team/config.yaml` in the main checkout, then the defaults below.
- `.team/` stays local; only `.team/config.yaml` may be shared when the PO explicitly asks. Initialization handles ignore rules (`skills/init-team/SKILL.md`).
- Workers never read `config.yaml`: the Orchestrator puts what each needs (resolved skills, `commands.verify`, branch and delivery rules, `human_only`) in its Task spec. Agents used directly follow it through `~/.claude/CLAUDE.md` / `~/.codex/AGENTS.md`.
- Repo rules in `AGENTS.md` / `CLAUDE.md` win; the config only maps them to team settings.

Values shown are the defaults; `e.g.` marks an example.

```yaml
tracker:
  type: none                 # backlog | jira | linear | github | gitlab | none
  project: owner/repo        # e.g.
  access: manual             # mcp | cli | api | manual (PO pastes the ticket)
  write: false               # agents never post
  query: "assignee:me state:open"   # e.g.
languages:
  client: en                 # tracker drafts
  po: en                     # PO summaries, gate walkthroughs
branches:
  base: main                 # feature branches start here and target it
  client_visible: main       # what the client runs today
  naming: "{type}/{topic}"
delivery:
  mode: pr                   # pr | branch
  push: true                 # branch mode: push or keep local
  pr_title: "[{ticket}] {summary}"
commands:
  verify: ["<lint>", "<test>", "<build>"]   # or pointers to where the repo documents them
  install: "<install deps>"  # run once in each new worktree
  serial: false              # true = run one at a time (shared cache or device)
e2e: []                      # optional; heavy E2E commands, run only on request
worktree_links: [.env]       # untracked local files linked from the main checkout
skills:                      # slot values (`Skill slots`); empty = role core skills only
  build.ui: [extra-skill]    # e.g.
  project: [.claude/skills/<name>]   # skills shipped in the repo
ui_rules:                    # optional; Designer, UI Builders, Reviewer
  design_doc: DESIGN.md
  tokens: src/styles.css
  components: src/components # check before creating one
  dont: ["hardcoded colours or px sizes"]   # e.g.
  gate: on                   # G-UI: on = PO picks the option for new screens; off = Orchestrator picks
  visual_loop: off           # on = Builder screenshot loop per UI slice; off = only when the PO asks
                             # other keys (screens, platform, copy) pass as-is to the Task spec
ui_viewports: []             # e.g. ["desktop 1280x800", "mobile 390x844"]; set when there is a UI
ui_screenshots: false        # true = capture shots for the visual loop and G-UI (`skills/orchestrator/references/specs.md` working rules)
perf_metrics: "latency and memory of the changed path, measured before and after"
compliance: []               # e.g. [gdpr], [appi], [vn-pdpl]; its skills go in skills.security as references, never replacing the regime
perf_notes: <path>           # optional perf ledger for the Perf auditor
human_only: []               # steps agents only list for the PO, e.g. ["on-device testing"]
flow:
  max_concurrent_agents: 3
docs:
  legacy: []                 # existing docs kept read-only
  html: on                   # render docs/diagrams/*.html (docs-policy.md); off = markdown only
  site: off                  # pages = GitHub Pages workflow (docs-policy.md "Published site")
  html_lang: null            # null = languages.po
models:
  catalog: {}                # required before dispatch; named agent/model/effort entries
  tiers: {}                  # fast | work | top -> ordered catalog aliases
  roles: {}                  # optional role -> {tier: work, prefer: [alias]}
```

## Model settings

`.team/config.yaml` owns the allowed agents, model ids, effort values and fallback order. There is no shared model registry or provider preference. An empty or legacy `models` section requires the model interview in `skills/init-team/SKILL.md` before dispatch; preserve the rest of the config.

Example structure only; replace model placeholders with PO-approved ids supported by the selected agent:

```yaml
models:
  catalog:
    quick:
      agent: codex            # Orca --agent id, not necessarily the AI provider
      model: "<model-id>"
      effort: low
    implementation:
      agent: codex
      provider: openai         # optional descriptive metadata; not a launch flag
      model: "<model-id>"
      effort: medium
    deep-review:
      agent: claude
      model: "<model-id>"
      effort: high
  tiers:
    fast: [quick]
    work: [implementation]
    top: [deep-review]
  roles:
    builder: {tier: work, prefer: [implementation]}
    reviewer: {tier: top}
    delivery: {tier: fast}
```

- `catalog.<alias>`: required `agent`; `model` and `effort` are strings or null. Null/omitted means omit that launch flag and use the agent's setting, not a guessed model. Optional `enabled: false` removes the entry from routing. Provider/account configuration and secrets stay in the agent; `provider` describes the intended backend without switching it.
- `tiers`: ordered alias lists, cheapest/preferred first as chosen by the PO. Every alias must exist in `catalog`; supported tier names are `fast`, `work`, `top`. Use separate aliases for different effort settings. Model names and provider names do not establish quality, price or availability.
- `roles`: optional role-id mappings. `tier` overrides the role's default; `prefer` reorders eligible entries within that tier. Missing keys retain the role default and tier order. A referenced alias must belong to the selected tier.
- Validate types, alias references, role ids and required tier coverage before dispatch. Require a matching model when an effort flag needs one; use the selected agent's supported effort values rather than a universal effort ladder. Reject placeholder model ids. A missing/disabled eligible entry blocks the affected Task; ask for a config decision rather than inventing a model.
- Existing `models.agents` and per-agent tier maps are legacy inputs to the interview, not dispatch settings. Show their proposed translation for PO agreement; preserve explicit disabled-agent choices. Missing old model/effort values remain unanswered rather than being filled from a deleted registry.

## Model routing

1. Read the main checkout's `.team/config.yaml` before planning a Run, on resume and before dispatch/follow-up; refresh it when changed. Workers receive resolved settings, not the full catalog. Keep existing workers only while their settings remain eligible; a newly disabled entry is not eligible for further work.
2. Choose the Task tier from its role and risk. `fast`: a bounded mechanical/simple edit; `work`: implementation, investigation and multi-behaviour fixes; `top`: architecture decisions, difficult reasoning or security-sensitive work. Role cards supply defaults, including the Builder's simple-Task fast option; an explicit project role tier overrides that default. Task risk may require a higher tier at initial planning; failed fix rounds still follow the PO escalation gate. Preserve required checks and keep the Reviewer's tier at least the Builder's. A config override cannot remove a risk-triggered check.
3. Honor an explicit PO model override for the stated Task and record the exception; ask only for missing routing values, not repeat approval. Otherwise use the configured eligibility rules. Use the role's `prefer` order, then remaining enabled aliases in the tier. Agent availability and supported flags come from the installed Orca/agent guides and observed launch results. Check authentication only through a supported read-only command; no quota probes, account switching or sign-in automation.
4. Pass only the entry's resolved flags that the selected agent supports. Verify the launch receipt. Missing CLI, authentication failure, unsupported flags/model or rate limit: record the evidence, then try the next eligible entry in the same tier and notify the PO. A repeated ambiguous launch uses the receipt's recovery path, not a fresh launch. An actual code/verify failure follows fix-round policy, not automatic provider retries. If no entry works, ask the PO; never silently lower the tier or start an unapproved higher-tier fix round.
5. Builder and Reviewer use independent sessions/Dispatches; they may use the same provider/model. Orchestrator and direct Researcher/Solution Architect sessions retain their session model; dispatched workers follow the catalog. Record the chosen alias, tier, agent, model, effort and selection reason in each Task (`skills/orchestrator/references/specs.md`).

## Skill slots

- Slots: `design`, `architecture`, `build.ui`, `build.core`, `qa`, `review`, `security`, `perf`.
- Resolution: project `skills.<slot>` > empty (role core skills only). A slot skill not installed: tell the PO once, never skip silently.
- A config with a `profile:` key: ignore the key.
