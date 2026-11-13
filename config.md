# Project config

## Project config

- Lookup: `.team/config.yaml` in the main checkout, then a `## Team config` block in `AGENTS.md` (legacy), then the defaults below.
- Local while experimenting: `/.team` in `.git/info/exclude` (no trailing slash, so worktree links are ignored too; per clone); never edit `AGENTS.md` or `.gitignore` for it, never commit or push team files. Shared later: commit only `.team/config.yaml`.
- One `.team/` per repo: right after `orca worktree create` (or `worker-start --worktree new-child`), `ln -s <main checkout>/<path> <worktree>/<path>` for `.team` and each `worktree_links` path. Codex writes through the link only when `<main checkout>/.team` is in `sandbox_workspace_write.writable_roots` of `~/.codex/config.toml`.
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
  po: vi                     # PO summaries
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
ui_screenshots: false        # true = capture shots for the visual loop and G-UI (orca.md "Browser")
perf_metrics: "latency and memory of the changed path, measured before and after"
compliance: []               # e.g. [gdpr], [appi], [vn-pdpl]; its skills go in skills.security as references, never replacing the regime
perf_notes: <path>           # optional perf ledger for the Perf auditor
human_only: []               # steps agents only list for the PO, e.g. ["on-device testing"]
flow:
  default_size: auto         # auto | S0 | S1 | S2 | S3
  max_size: S3
  max_concurrent_agents: 3
docs:
  legacy: []                 # existing docs kept read-only
  html: on                   # render docs/diagrams/*.html (docs-policy.md); off = markdown only
  site: off                  # pages = GitHub Pages workflow (docs-policy.md "Published site")
  html_lang: vi              # defaults to languages.po
models:
  agents: {}                 # per-agent on/off, e.g. {copilot: off, cursor: off}; missing = on; off = never routed to
  tiers: {}                  # remap a tier per agent column, e.g. {work: {codex: <model-id>}}
  roles: {}                  # role tier override, e.g. {builder: top, qa: fast}
```

## Model settings

- Model ids, tiers and efforts live in `coding-agents.md` "Model tiers"; agent choice per Task in `coding-agents.md` "Routing".
- `models.agents.<agent>: off` removes the agent from routing; its Tasks go to the next eligible agent (`coding-agents.md` "Free-tier agents" for `simple` Tasks).
- Per Task the Orchestrator may move effort one step within the tier (up for money, concurrency, migrations, security; down for mechanical work) and records why in the spec.
- `models.tiers.<tier>` remaps the agent columns of `coding-agents.md` "Model tiers" (`claude`, `codex`, `cursor`) and `effort` per project (missing keys keep the table); `models.roles` keys are the role ids of `roles/`.
- Precedence: escalation (`orchestrator/review.md`) > role card size rule > `models.roles` > role default.

## Skill slots

- Slots: `design`, `architecture`, `build.ui`, `build.core`, `qa`, `review`, `security`, `perf`.
- Resolution: project `skills.<slot>` > empty (role core skills only). A slot skill not installed: tell the PO once, never skip silently.
- A config with a `profile:` key: ignore the key.

## Starting values by platform

Used only by the `init-team` skill; written into the project's `.team/config.yaml`, which then owns them. Other platforms: empty slots.

- **web**
  - `design`: [design-taste-frontend]
  - `build.ui`: [frontend-ui-engineering]; React/Next.js: add vercel-react-best-practices
  - `build.core`: [api-and-interface-design, database-schema-designer, security-and-hardening]
  - `qa`: [orca-cli]
  - `perf`: [browser-testing-with-devtools, frontend-ui-engineering] (DevTools MCP for perf traces only; the Orca browser records none)
  - `perf_metrics`: "LCP, INP, CLS, bundle size, axe findings"
  - `ui_screenshots`: true
  - `ui_viewports`: ["desktop 1280x800", "mobile 390x844", "mobile dark"]
- **apple** (iOS, iPadOS, macOS)
  - `security`: [security-and-hardening]
  - `build.ui`: the project's own SwiftUI skill (`skills.project`)
  - `perf_metrics`: "launch time, main-thread hangs, memory, scroll hitches (Instruments)"
  - `ui_screenshots`: false unless the project allows simulator or device capture
  - `ui_viewports`: ["iPhone 16", "iPhone 16 dark", "Mac window"] (mockups only)
  - `commands.serial`: true; `flow.max_concurrent_agents`: low (xcodebuild shares DerivedData, each new worktree is a cold build; prefer one Builder at a time)
