# Team dashboard (Orca plugin)

The dashboard's **Tasks** tab (`#tk-theo-repo`) as an Orca right-sidebar panel, with live data from the ledger API that this plugin's worker hosts itself.

Open it: `orca plugin open local.team-dashboard --panel tasks`

## How it works

- Three folders are generated from the repository by `scripts/sync-web.mjs`, so the plugin folder is self-contained and imports nothing from `../ledger` or `../dashboard` at run time: `ledger/` (a copy of `ledger/*.ts`), `dashboard-web/` (the full dashboard web bundle the API serves) and `web/` (the panel). Inputs are checked before anything is written or pruned (a missing source tree is an error, not an empty one), straight copies are byte for byte, and the paths are validated through every parent from the repository root (no links, no `..`). `web/` is made from `dashboard/web`: the dashboard's own `dash.js`, `lib/charts.js`, every `tabs/*.js` and `css/app.css` byte for byte, and `panel.html` made from `index.html` (top bar and `main.js` removed). Never edit those by hand. The copied set is `dash.js` plus every module it imports, so a new shared module follows automatically. After changing `dashboard/web`, run `node orca-plugin/scripts/sync-web.mjs` (it also deletes generated files the dashboard no longer has; imports must be relative and stay inside `js/`, otherwise the sync stops with an explanation); `orca plugin test` fails (`src/web-sync.test.ts`) while the two differ.
- `web/panel.js` and `web/panel.css` are this plugin's own. `panel.js` answers dash.js's `fetch("/api/data?days=N")` through `plugin.request('tasks.open')` and `tasks.chunk` (see the next point), shows a bar with a message and retry when 4747 is down, and keeps the last snapshot in `localStorage` so the panel paints at once and refreshes after. `panel.css` adds a light palette (Orca's `html.light`) and a narrow-sidebar gutter.
- `src/worker.ts` reads the snapshot from the in-process API (`dashboardData` in `src/ledger-host.ts`, no network hop) and `src/trim.ts` cuts it to what the Tasks tab reads (message bodies to 600 characters, repo names kept for the filter). A 30-day snapshot is still over 1 MiB, so the worker holds it as numbered chunks (`tasks.open`, then `tasks.chunk` per piece, each reply under 900 KB; ids are unique per worker lifetime, so a restart answers `expired` and the panel reopens the range it asked for) and `web/panel.js` joins them; `src/protocol.ts` types both calls. `web/source.js` is the panel's fetch shim and status bar logic (tested in `scripts/source.test.mjs`).

## Ledger host and dashboard server

The worker hosts the agent history ledger and the dashboard (`src/ledger-host.ts`):

- ingest into `~/.agents/ledger` (or `AGENT_LEDGER_HOME`) at once and every 60 s, plus a debounced pass on `agent.status.changed` and `workspace.created/removed`;
- the dashboard API and web UI (`createApi` from the packaged `ledger/`, assets from `dashboard-web/`) and `GET /health`, on one listener, **127.0.0.1:4747**. While another server holds the port the listener retries (every 5 s) and the status bar says so. Every route answers only to a loopback `Host` header (403 otherwise);
- a status bar item such as `Ledger 12:04 ✓ 4747` (`4747 busy` while another server holds the port; ⚠ means the listener or the API failed, the tooltip says why);
- shutdown order: the listener, the API's worker, then ingest; every step is attempted even if one fails. A failed start rolls back whatever it had started.

Environment: `AGENT_DASHBOARD_WEB` defaults to the plugin's `dashboard-web/`; `AGENT_TEAM_HOME` (the team checkout with `skills/`) defaults to `~/.agents/teams`. `TEAM_DASHBOARD_PORT` overrides the port (a value that is not a port number fails the start before anything runs; tests use it) and `TEAM_DASHBOARD_RETRY_MS` the busy-port retry interval. Tests set `TEAM_DASHBOARD_NO_LEDGER=1` so they never ingest or bind ports. A failed startup shows as "Ledger ✗ not started"; an API that cannot be imported or started leaves ingest and `/health` running (⚠ and the reason in the status bar).

## Develop

```sh
node orca-plugin/scripts/sync-web.mjs --check   # fails when web/, ledger/ or dashboard-web/ drifted from the repository
orca plugin test orca-plugin && orca plugin check orca-plugin
npx -p typescript@5 tsc -p orca-plugin
orca plugin dev watch ./orca-plugin --check --shot ./orca-plugin/.orca/shots
```

An HTML panel counts as drawn when its page has loaded, so a shot shows the cached first paint, not the worker's answer.
