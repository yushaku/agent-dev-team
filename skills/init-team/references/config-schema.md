# Project config schema

Schema and defaults for `.team/config.yaml`, written by `init-team`.

## Resolution

- Lookup: `.team/config.yaml` in the main checkout, then the defaults below.
- `.team/` stays local; only `.team/config.yaml` may be shared when the PO explicitly asks. Initialization handles ignore rules (`skills/init-team/SKILL.md`).
- Workers never read `config.yaml`: the Orchestrator puts what each needs (resolved skills, `commands.verify`, branch and delivery rules, `human_only`) in its Task spec. Agents used directly follow it through `~/.claude/CLAUDE.md` / `~/.codex/AGENTS.md`.
- Repo rules in `AGENTS.md` / `CLAUDE.md` win; the config only maps them to team settings.

Values shown are the defaults; `e.g.` marks an example.

`init-team` writes every key explicitly (value plus a short comment where not obvious), so a complete config needs no schema lookup. The Orchestrator reads this file only for a missing or unknown key.

Platform presets: `skills/init-team/references/platforms.md`. Model presets: `skills/init-team/references/models.md`.

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
codegraph: on                # on = index each code worktree; the codegraph MCP is installed globally ("Code search setup" below)
skills:                      # slot values (`skills/orchestrator/references/routing.md` "Skill slots"); empty = role core skills only
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

## Models

`.team/config.yaml` owns the allowed agents, model ids, effort values and fallback order. There is no shared model registry or provider preference. An empty or legacy `models` section requires the model interview in `skills/init-team/SKILL.md` before dispatch; preserve the rest of the config.

Example structure only; replace model placeholders with PO-approved ids supported by the selected agent. Concrete presets and id discovery: `skills/init-team/references/models.md`. Runtime routing: `skills/orchestrator/references/routing.md` "Model routing".

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
    designer: {tier: top}     # override: role card default is work
    delivery: {tier: fast}
```

- `catalog.<alias>`: required `agent`; `model` and `effort` are strings or null. Null/omitted means omit that launch flag and use the agent's setting, not a guessed model. Optional `enabled: false` removes the entry from routing. Provider/account configuration and secrets stay in the agent; `provider` describes the intended backend without switching it.
- `tiers`: ordered alias lists, cheapest/preferred first as chosen by the PO. Every alias must exist in `catalog`; supported tier names are `fast`, `work`, `top`. Use separate aliases for different effort settings. Model names and provider names do not establish quality, price or availability.
- `roles`: optional role-id mappings. `tier` overrides the role's default; `prefer` reorders eligible entries within that tier. Missing keys retain the role default and tier order. A referenced alias must belong to the selected tier.
- Existing `models.agents` and per-agent tier maps are legacy inputs to the interview, not dispatch settings. Show their proposed translation for PO agreement; preserve explicit disabled-agent choices. Missing old model/effort values remain unanswered rather than being filled from a deleted registry.

## Code search setup

`codegraph: on` (default): the codegraph MCP is installed globally once per agent; each code worktree needs only an index.

- MCP: install once per agent with `codegraph install` or the agent's user-level MCP config. The Claude entry needs `"alwaysLoad": true`. `codegraph serve --mcp` finds the index by walking up from the session cwd, so no per-project MCP files or trust prompts.
- Setup: Orca repo Setup script `codegraph init .`; prepend it to any existing setup (e.g. `codegraph init . && cd functions && npm install`). Outside Orca run `codegraph init .` after creating the worktree.
- Teardown: Orca repo Archive script `${AGENT_TEAM_HOME:-~/.agents/teams}/bin/cg-wt-rm --stop-only` stops the worktree's codegraph daemon and MCP processes; outside Orca, `cg-wt-rm <worktree>` also removes the worktree.
- `codegraph: off` (unsupported language, huge monorepo): skip setup and the search rule.
- The dashboard "Tìm code" tab shows codegraph vs rg/grep calls per agent, role and worktree.
