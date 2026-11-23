# Team dashboard

Run the local server as a LaunchAgent (label `<label>`).
Restart it with `launchctl kickstart -k gui/$(id -u)/<label>`.
Read its log at `~/Library/Logs/team-dashboard.log`.

Run the tests with `python3 -m unittest discover -s tests`.
Run the frontend regression tests with `node --experimental-vm-modules --test tests/test_frontend.mjs`.

| Path | Purpose |
| --- | --- |
| `server.py` | HTTP entry point |
| `backend/` | Configuration, cache, parsers, usage and the skill panel endpoint |
| `backend/snapshots.py` | Background JSON snapshots by requested date range; HTTP serves the last complete response |
| `backend/parsers/` | Agent session parsers |
| `web/index.html` | Dashboard markup |
| `web/js/` | No-build ES modules (`main.js` shell, `dash.js` metrics, `sheet.js` skill side panel, `md.js` markdown) |
| `web/js/lib/charts.js` | Shared chart and DOM helpers |
| `web/js/tabs/` | Dashboard tab renderers |
| `web/css/app.css` | Dashboard styles |
| `web/vendor/` | Vendored browser libraries (marked, used by the skill panel) |
| `.cache/cache.json` | Runtime parse cache |
| `tests/` | Python and frontend tests, including the static whitelist check |

Edit `backend/parsers/<agent>.py` to change a parser.
Edit `backend/roles.py` to change a role rule.
Edit `web/js/tabs/<tab>.js` to change a dashboard tab.
Edit `web/js/sheet.js` to change the skill side panel.
Edit `web/css/app.css` to change styles.

Requested date ranges refresh in the background about every 30 seconds. A range's first request waits for its initial build; subsequent requests use its last complete snapshot, including while a refresh is running or fails. `generated_at` records the snapshot time and `build_ms` its build duration, not HTTP latency. Orca refreshes separately every 60 seconds. The browser renders only the selected tab.

## Token measurements

The dashboard measures tokens, not dollars. Total = fresh input + cache read + cache write + output; reasoning is already part of output. Run totals include worker retries and Orchestrator calls carrying an executed Orca Run ID. The Run table separates lifetime tokens from tokens in the selected date range.

Worker session reuse is split by Task assignment time. The dashboard preserves unassigned tokens and labels inference from a unique dispatch window. Attribution coverage is the fraction of observed tokens linked to a Run, not proof that every provider log is available. Hermes stores session totals only: multi-Run sessions stay unassigned, and date charts place totals on the session start date.

New Task specs carry one `Measurement:` JSON line (see the orchestrator Task spec rules). Historical Task names are estimates; missing round/cause values remain unknown. A spec approval does not count as delivery. Delivery requires a completed delivery Task, an approved gate on the close Task and no open Tasks; merge/cancellation requires explicit state. Lead time ends at delivery approval, and gate wait is the union of gate intervals, so overlapping gates are not counted twice.

The CLI tools tab shows commands installed on the machine running the server as cards via `/api/cli-tools`. It reads the user's login-shell PATH (with a five-second timeout, falling back to the server PATH), then supplements it with the server PATH. Executables are discovered dynamically; command names are never predefined. Symlink targets and local package metadata identify Homebrew, npm, Cargo, uv and pipx installations; other tools are grouped by their actual directory. Default system commands are excluded by their resolved installation directory, including from alternative copies. Installed copies are ordered by PATH; a system command may still take precedence in the terminal. Versions appear only where installation metadata provides them. Aliases, shell functions and executables outside PATH are excluded. The scan starts when the tab first opens; `Quét lại` discovers subsequent installs and removals. The scan runs shell startup to read PATH, but never invokes the discovered tools to inspect them. Token filters do not apply to this inventory.

Directory groups under `/Applications` and the current user's `~/.local/share` are merged into one group per root. Recognized package-manager sources keep their own groups.

Homebrew cards distinguish requested installations from dependencies using the local formula or cask `INSTALL_RECEIPT.json`. `installed_on_request: true` is labelled `Cài trực tiếp`; `false` or the legacy `installed_as_dependency: true` marks a dependency. Explicitly requested packages remain direct installations even if another package also depends on them. Missing or malformed receipts remain visible as `Chưa rõ cách cài`. Dependencies are hidden by default; `Hiện dependency Homebrew` includes them in the list and search results.

All sources use one card per package and version, with separate Homebrew sections for direct installations, dependencies and unknown receipts. Commands without package metadata keep individual cards. Packages from different sources stay separate. Each card lists its commands, showing six initially and the remainder in an expandable list. Searching for a command returns its package with all sibling commands. Package descriptions prefer package metadata, then the matching command's description, then another available command description.

Cards show a short description from the installed command's man page, falling back to Homebrew's formula description, npm's `package.json` or the matching Python package's `METADATA` summary. Hover over the description to see its source. Package descriptions can apply to several commands; commands with no matching metadata have no description. Search includes descriptions. All descriptions come from local files, without running tools or fetching remote content.

Team docs live on the docs site, linked from the top bar as `Tài liệu`.

The Tasks run chart toggles between elapsed time and token consumption while keeping tasks in start order. Token bars chain in row order on a cumulative token axis. Orchestrator has a separate lane: its observed span includes idle time; dispatch, gate and inbox events mark recorded coordination, and gate intervals show PO wait. The sequence diagram shows one lane per worker, with chronological arrows for dispatches, PO gates and inbox messages. Reused workers keep their lane across tasks. Selecting an arrow by pointer or keyboard opens the full message in the dashboard detail modal. It reads inbox history without consuming messages, capped at the newest 500 per Run; unavailable or capped inbox data is labelled. Reused worker handles resolve to the dispatch active at the message timestamp; unknown addresses remain visible.

Model catalogs and tier preferences live in each project's `.team/config.yaml` (`config.md`). Task specs carry the initial `Routing:` selection and a `Routing-log:` pointer to `.team/<feature>/routing.jsonl`. After dispatch, the Orchestrator appends resolved selections keyed by Task and Dispatch id; retries retain separate records. The dashboard reads only matching Task records from logs contained in `.team/`, including shared `.team` symlinks. Role defaults come from `skills/team-*/SKILL.md`. A session's observed model/agent and effort are compared with its own resolved selection, without guessing tiers from model names. Missing or ambiguous routing history remains unverified; historical sessions are not classified through the current project catalog. No new YAML dependency is required by the dashboard.

## Feature Runs

The UI is for humans (charts first); the API is for agents.

`/api/data?days=N` includes `features`: `runs`, `comparison` and `attribution`. Runs group selected-window session rows by repo and branch, skipping main, master, HEAD and empty branches. Git worktree metadata resolves the main checkout; removed Orca worktrees retain the repo-name path heuristic. A group with any Orca-attributed session is `orca`, otherwise `direct`. Existing Orca attribution and totals remain separate.

Each feature Run has `repo`, `branch`, `variant`, `run_ids`, `first_activity`, `last_activity`, `lead_seconds`, `tokens`, `orchestrator_tokens`, `worker_tokens`, `session_count`, `agents`, `loaded_skills`, `fix_rounds: {count, source}`, `gate2_findings` and `delivered`. Tokens and skills cover the selected window; activity spans use the contributing sessions' recorded bounds. Direct Runs have no worker/orchestrator split. The Runs tab's filters select whole feature Runs and keep their complete window totals.

Each Run also has a stable `id` (the compact JSON encoding of `[repo, branch]`), `sources` for checkout resolution, tokens, activity, findings and delivery, and a `heuristics` list. Fix-round provenance stays in `fix_rounds.source`. The UI compares variants with bars, shows fix-round buckets and plots one mark per Run at its last activity time. Filled marks mean merged; hollow marks mean unmerged, with a dashed outline for unknown delivery. The detail table is collapsed below the charts.

Fix-round sources, in order: distinct builder report round numbers under the branch's last path segment in the main checkout's `.team/`, code-review loads minus one (minimum zero), then distinct Orca Measurement rounds. Existing Orca summaries and fix-round checks use these counts too. Reports take precedence even when the directory is empty. Gate 2 findings count exact `- Gate 2 finding:` lines in `decisions.md`; a missing file yields null. Comparison totals include only known findings and expose `gate2_known` coverage.

Delivery is true/false/null from local branch ancestry against the local default branch (origin/HEAD, then main/master), with a two-second Git timeout. No fetch occurs; deleted branches remain unknown. Ancestry results are cached by repo, branch and both head SHAs. Unknown Orca stages use linked feature Runs as a fallback, marking merged only when all linked branches are merged. Report counts can also resolve from recorded Orca Task worktree names when no branch sessions are in the date window. Branch reuse and identical repo basenames can combine unrelated work; this is a comparison heuristic, not an audit trail.

## For agents

`backend/insights.py` aggregates the snapshot server-side; no need to download `/api/data`.

```
curl -s 'localhost:4747/api/agent/summary?days=7&repo=&run=&role=&agent='   # markdown, a few KB
curl -s 'localhost:4747/api/agent/summary?days=7&format=json'               # same data as JSON
curl -s 'localhost:4747/api/agent/run?id=<runId>'                           # one Run (add &format=json)
```

- `summary`: scope, totals, token by role (model/effort mix, share), skill loads by role, Run table, issues sorted by severity. All filters are optional.
- `run`: tasks in order (role, kind, round, agent/model/effort, selected tier, tokens, duration, skills), gates with waits, issues for that Run. Unknown id returns 404. Skills cover only the last `days` (default 7).
- `summary` also has a "Code search by role" table (codegraph, rg/grep, rg_symbol, codegraph share). `rg_symbol` is an extra kind on rg/grep calls whose pattern is a code symbol (`symbol_searches` from `bin/cg_nudge.py`) in a repo with `.codegraph/`; it is never a chart segment. Known limitation: a removed worktree has no `.codegraph/` anymore, so historical sessions from deleted worktrees count as not indexed.
- Issues (`id`, `severity`, Vietnamese `title`/`evidence`/`suggestion`, `filter` hint): top-tier reviewer on a scoped re-review, required role-card skill never loaded, more than 2 fix rounds, session tokens above 3x the role median, observed routing differs from the selection, PO gate wait above 50% of lead time, 3 or more symbol lookups via rg/grep in an indexed repo per Run and role. Thresholds are constants at the top of `insights.py`. The Tổng quan page lists the same issues under "Vấn đề".
