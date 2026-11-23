# Team dashboard (Orca plugin)

The plugin is the single home of the team dashboard: the agent history ledger, the dashboard API, the web UI and the Orca sidebar panel. Its worker keeps the ledger up to date and serves the dashboard on **http://127.0.0.1:4747** while Orca runs.

Open the panel: `orca plugin open local.team-dashboard --panel tasks`. Open the full dashboard in a browser: http://127.0.0.1:4747.

## Layout

| Path | What it is |
| --- | --- |
| `orca-plugin.json` | Manifest: a trusted worker (`src/worker.ts`), the `tasks` HTML panel (`dashboard-web/index.html`), a status bar item |
| `ledger/` | The ledger: ingest of agent histories into SQLite, projections, the dashboard API (`api.ts`), the small HTTP server (`http.ts`). Own README: `ledger/README.md`. Also the launchd fallback entry `ledger/daemon.ts` and `ledger/agent-ledger.plist` |
| `dashboard-web/` | The web UI, one set of files for both uses: `index.html` plus `js/`, `css/`, `vendor/`. The API serves every file of this directory. Inside Orca's panel `js/main.js` loads `js/orca-panel.js` (data from the worker, status bar; `js/orca-source.js` is its fetch shim) and `css/orca-panel.css` styles it (scoped to `html.orca` and Orca's `html.light`) |
| `src/` | The worker: `ledger-host.ts` (ingest, API, listener, status bar), `worker.ts` (the panel's `tasks.open`/`tasks.chunk`), `trim.ts`, `protocol.ts` |
| `tests/` | Frontend tests (`frontend.impl.mjs` under a wrapper) and the panel's fetch shim tests |

Nothing is generated and nothing is copied: `src/ledger-host.ts` imports `../ledger/*.ts` and the API serves `../dashboard-web`, both inside this folder, so the folder works from a copy outside the repository (`git archive HEAD orca-plugin`). The team root (`AGENT_TEAM_HOME`, the checkout containing `skills/`) is the only thing read from outside: it defaults to `~/.agents/teams`.

## Ledger host and dashboard server (`src/ledger-host.ts`)

- Ingest into `~/.agents/ledger` (or `AGENT_LEDGER_HOME`) at once and every 60 s, plus a debounced pass on `agent.status.changed` and `workspace.created/removed`.
- The dashboard API, the web UI and `GET /health` on one listener, **127.0.0.1:4747**. While another server holds the port the listener retries (every 5 s) and the status bar says so; any other listener error tears the host down. Every route answers only to a loopback `Host` header (403 otherwise).
- A status bar item such as `Ledger 12:04 ✓ 4747` (`4747 busy` while another server holds the port; ⚠ means the listener or the API failed, the tooltip says why).
- Shutdown order: the listener, the API's worker, then ingest; every step is attempted even if one fails. A failed start rolls back whatever it had started. Activation and shutdown run one after another on one chain.
- The Tasks panel reads the snapshot from the in-process API (`dashboardData`, no network hop). `src/trim.ts` cuts it to what the Tasks tab reads (message bodies to 600 characters, repo names kept for the filter). A 30-day snapshot is over 1 MiB, so the worker holds it as numbered chunks (`tasks.open`, then `tasks.chunk` per piece, each reply under 900 KB; ids are unique per worker lifetime, so a restart answers `expired` and the panel reopens the range it asked for).

Environment: `AGENT_DASHBOARD_WEB` defaults to this folder's `dashboard-web/`; `AGENT_TEAM_HOME` defaults to `~/.agents/teams`. `TEAM_DASHBOARD_PORT` overrides the port (a value that is not a port number fails the start before anything runs; tests use it), `TEAM_DASHBOARD_RETRY_MS` the busy-port retry interval. Tests set `TEAM_DASHBOARD_NO_LEDGER=1` so they never ingest or bind ports. A failed startup shows as "Ledger ✗ not started"; an API that cannot be imported or started leaves ingest and `/health` running.

## Verify (the only place these commands are written down)

Run from the repository root. Node 24 or 26 (`node:sqlite`, type stripping); Orca's own Node is 24.

```sh
node --test orca-plugin/ledger/tests/*.test.ts                      # the ledger: ingest, projections, API, golden files
node --experimental-vm-modules --test orca-plugin/tests/frontend.impl.mjs   # the web UI render code
node --test orca-plugin/tests/source.test.mjs                       # the panel's fetch shim
orca plugin test orca-plugin                                        # everything above plus src/*.test.ts, under Orca's runner
orca plugin check orca-plugin && orca plugin validate orca-plugin
npx -p typescript@5 tsc -p orca-plugin
```

`ledger/tests/golden/` holds Python's output for the fixtures, frozen from the retired Python dashboard (see `ledger/tests/golden.ts`); the test team in `ledger/tests/fixtures/team` makes roles and skills the same everywhere. With Orca's Node: `ELECTRON_RUN_AS_NODE=1 "/Applications/Orca.app/Contents/Frameworks/Orca Helper.app/Contents/MacOS/Orca Helper" --test orca-plugin/ledger/tests/*.test.ts`.

## Develop and run

```sh
orca plugin dev load ./orca-plugin                       # load (and reload) the live plugin; approval is asked once
orca plugin dev watch ./orca-plugin --check --shot ./orca-plugin/.orca/shots
curl -s http://127.0.0.1:4747/health                    # last pass, counts, listener and API state
```

An HTML panel counts as drawn when its page has loaded, so a shot shows the cached first paint, not the worker's answer. The page keeps the last snapshot in `localStorage` so the panel paints at once and refreshes after.

If Orca is not running, the dashboard is down. The launchd fallback (`ledger/README.md`, "Install as a macOS LaunchAgent") only ingests; it does not serve the dashboard.
