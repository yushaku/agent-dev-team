# Software Dev Agent Team

A process for a team of coding agents working a software project inside the Orca app. A human Product Owner approves at fixed gates (spec and tickets, prototypes of new screens, delivery); an Orchestrator, which can be any coding agent, plans with the PO using Matt Pocock's skills (`grill-with-docs`, `to-spec`, `to-tickets`), maps each ticket to an Orca Task, defaults to one Builder and one independent Reviewer on a different agent, adds specialists for specific gaps and ends at a draft PR or a committed branch. Per-project specifics live in a project config, `.team/config.yaml`.

Vietnamese docs for the Product Owner: https://yushaku.github.io/agent-dev-team/

## How it works

Who hands work to whom: the PO talks to the Orchestrator and to discussion sessions; the Orchestrator dispatches every worker.

![Who hands work to whom](diagrams/team-overview.svg)

An example for a new capability (grill, spec, tickets, build, review), with the PO's gates:

![Main dev flow](diagrams/dev-flow.svg)

The Builder builds each ticket test-first (`tdd`), with related docs and delivery evidence. One Reviewer runs `code-review` on the result. The Orchestrator hands off the reviewed branch or opens the draft PR, and adds specialists only for uncovered needs. For team selection, see [Team decisions](skills/orchestrator/references/start.md#team-decisions).

## Requirements

- macOS with Homebrew
- Claude Code or Codex, installed and signed in
- Everything else is installed below

## Install

Copy each block into a terminal.

1. Tools: Orca, GitHub CLI, jq, Node.

```sh
brew install --cask orca
brew install gh jq node
gh auth login
```

Open Orca once and turn on its CLI, then check: `orca --version`.

2. Clone this repo to `~/.agents/teams` (the default team root).

```sh
git clone https://github.com/yushaku/agent-dev-team.git ~/.agents/teams
```

Cloned elsewhere: `export AGENT_TEAM_HOME=/path/to/clone` in your shell profile.

3. Install the pinned skills globally for Claude Code and Codex.

```sh
cd ~/.agents/teams
jq -r '.skills | to_entries | group_by(.value.source)[]
  | "npx -y skills add \(.[0].value.source) -g -y -a claude-code codex " + (map("-s " + .key) | join(" ")) + " </dev/null"' \
  skills-lock.json | sh
```

Every downloaded skill a worker skill or `skills/init-team/references/config-schema.md` names is pinned in `skills-lock.json` and never edited in place. Add one by running `npx skills add <repo> -s <name> -a claude-code -y` in a scratch git dir and copying its `skills-lock.json` entry here.

4. Link the team's own skills (`init-team`, `orchestrator`, `team-*`, `anti-ai`, `frappe-docs`, ...).

```sh
cd ~/.agents/teams
mkdir -p ~/.agents/skills ~/.claude/skills
for d in skills/*/; do
  n=$(basename "$d")
  ln -sfn "$PWD/skills/$n" ~/.agents/skills/"$n"
  ln -sfn "$PWD/skills/$n" ~/.claude/skills/"$n"
done
```

Codex reads `~/.agents/skills` directly; Claude Code reads `~/.claude/skills`.

5. Check.

```sh
cd ~/.agents/teams
for n in $(jq -r '.skills | keys[]' skills-lock.json) $(ls skills); do
  test -e ~/.agents/skills/"$n"/SKILL.md || echo "missing: $n"
done; echo "check done"
```

No `missing:` lines means every skill is in place.

## Quickstart

1. Open the project repo in Orca and start Claude Code or Codex in a terminal there.
2. Run `/init-team`: it reads the repo, asks a few questions one at a time and writes `.team/config.yaml` (local, never committed).
3. Run `/project-health`: it checks `commands.verify` against the checklist and proposes the missing checks.
4. Run `/orchestrator <job>`, for example `/orchestrator add CSV export to the reports page`.

## Workers and commands

- **Workers** (`skills/team-*`, dispatched by the Orchestrator as their own session and Task; each loads its skill plus the `references/` its Task spec lists in `Refs:`):
  - `team-builder`: one ticket at a time: tests, implementation, related docs, delivery evidence; prototype Tasks.
  - `team-reviewer`: independent review with `code-review`; security and perf/a11y checks are its references.
  - `team-support-engineer`: read-only ticket and production investigation.
- **Planning** (the Orchestrator with the PO, not workers): `grill-with-docs`, `to-spec`, `to-tickets`; see `skills/orchestrator/references/start.md` "Plan".
- **Commands** (`/orchestrator`, `/researcher`, `/solution-architect`, `/init-team`, `/project-health`): sessions the PO starts and chats with directly; the Orchestrator never dispatches them.

Checks are references of `team-reviewer` and `team-builder`, plus the `anti-ai` skill; they run inside a worker's session, never as a separate worker. Role ids (Task title prefix, `models.roles`, dashboard): `builder`, `reviewer`, `support-engineer`.

## Layout

- `workflow.md`: short overview, decision boundaries and reading index
- `skills/team-*/`: worker skills (see "Workers and commands" above), each with `references/`
- `skills/orchestrator/`: the Orchestrator skill; `references/` holds its step files, coding agents and ticket mode; Orca commands come from the version-matched skills
- `skills/init-team/references/config-schema.md`: project config schema and defaults; platform and model presets live beside it
- `skills/orchestrator/references/routing.md`: model routing and skill slots
- `docs-policy.md`: document ownership and authoring rules; worker reports use `skills/orchestrator/references/specs.md`
- `skills/`: skills the team wrote
- `skills-lock.json`: pinned downloaded skills
- `templates/`: file templates for projects
- `diagrams/`: architecture diagrams
- `docs/`: Vietnamese docs site (GitHub Pages); diagrams are `?embed=1` iframes sized from `style="--w; --h"` (the diagram's viewBox); update both when a re-render changes the viewBox
- `orca-plugin/`: the Orca plugin `local.team-dashboard`: the history ledger, the dashboard API and web UI served on 127.0.0.1:4747, and the Tasks panel (see `orca-plugin/README.md`)

## Metrics

The dashboard computes metrics per feature Run (repo + branch), for direct sessions and Orca Runs. Compare Runs before changing the process.

- Fix rounds: distinct round numbers in `.team/<feature>/reports/*-builder-r<N>*.md`, falling back to code-review skill loads minus one (minimum zero), then Orca Task Measurement rounds.
- Gate 2 findings: count of `- Gate 2 finding: <what>` lines in `.team/<feature>/decisions.md`. Whoever ran Gate 2 records each problem that sent work back using that line. This is the only manual metric input; a missing file or a file without the convention means unknown. Record `- Gate 2: no findings` when Gate 2 sends no work back. The convention starts on 2026-11-23.
- Tokens: observed branch segments plus tokens attributed to linked Orca Run IDs, including workers and Orchestrators on other branches, counted once per feature within the selected time range.
- Escaped defects: distinct fix commits within 30 days after the feature merge, estimated from blame and merge ancestry. A `Fixes-feature: <branch>` trailer overrides blame; fixes without a traceable feature stay unattributed.

## Dashboard

The local dashboard shows feature Run metrics and token usage. For the process itself, see the [Vietnamese docs site](https://yushaku.github.io/agent-dev-team/).

The Orca plugin `local.team-dashboard` serves it while Orca runs: open http://127.0.0.1:4747, or the plugin's sidebar panel (`orca plugin open local.team-dashboard --panel tasks`). Layout, how to run and how to verify (tests, `orca plugin check`, type check): `orca-plugin/README.md`, the only place those commands are written down.
