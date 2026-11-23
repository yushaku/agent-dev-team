# Team dashboard (Orca plugin)

The dashboard's **Tasks** tab (`#tk-theo-repo`) as an Orca right-sidebar panel, with live data from the Python dashboard on `http://127.0.0.1:4747`.

Open it: `orca plugin open local.team-dashboard --panel tasks`

## How it works

- `web/` is generated from `dashboard/web` by `scripts/sync-web.mjs`: the dashboard's own `dash.js`, `lib/charts.js`, every `tabs/*.js` and `css/app.css` byte for byte, and `panel.html` made from `index.html` (top bar and `main.js` removed). Never edit those by hand. The copied set is `dash.js` plus every module it imports, so a new shared module follows automatically. After changing `dashboard/web`, run `node orca-plugin/scripts/sync-web.mjs` (it also deletes generated files the dashboard no longer has); `orca plugin test` fails (`src/web-sync.test.ts`) while the two differ.
- `web/panel.js` and `web/panel.css` are this plugin's own. `panel.js` answers dash.js's `fetch("/api/data?days=N")` through `plugin.request('tasks.data')`, shows a bar with a message and retry when 4747 is down, and keeps the last snapshot in `localStorage` so the panel paints at once and refreshes after. `panel.css` adds a light palette (Orca's `html.light`) and a narrow-sidebar gutter.
- `src/worker.ts` fetches `/api/data` and `src/trim.ts` cuts it to what the Tasks tab reads (message bodies to 600 characters, repo names kept for the filter). A 30-day snapshot is still over 1 MiB, so the worker holds it as numbered chunks (`tasks.open`, then `tasks.chunk` per piece, each reply under 900 KB) and `web/panel.js` joins them; `src/protocol.ts` types both calls. `web/source.js` is the panel's fetch shim and status bar logic (tested in `scripts/source.test.mjs`).

## Ledger host

The worker also hosts the agent history ledger (`ledger/`, step 2a): `src/ledger-host.ts` starts ingest into `~/.agents/ledger` (or `AGENT_LEDGER_HOME`) at once and every 60 s, runs a debounced pass on `agent.status.changed` and `workspace.created/removed`, shows "Ledger HH:MM ✓" in the status bar, and serves `GET http://127.0.0.1:4748/health`. The worker imports `../../ledger/*.ts` by relative path, so it works from this repository's dev folder; shipping the plugin elsewhere needs `ledger/` copied in. Tests set `TEAM_DASHBOARD_NO_LEDGER=1` so they never ingest or bind 4748. A failed startup shows as "Ledger ✗ not started" in the status bar, and a `/health` listener that cannot bind adds a ⚠ with the reason.

## Develop

```sh
node orca-plugin/scripts/sync-web.mjs --check   # fails when web/ drifted from dashboard/web
orca plugin test orca-plugin && orca plugin check orca-plugin
npx -p typescript@5 tsc -p orca-plugin
orca plugin dev watch ./orca-plugin --check --shot ./orca-plugin/.orca/shots
```

An HTML panel counts as drawn when its page has loaded, so a shot shows the cached first paint, not the worker's answer.
