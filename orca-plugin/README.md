# Team dashboard (Orca plugin)

The dashboard's **Tasks** tab (`#tk-theo-repo`) as an Orca right-sidebar panel, with live data from the Python dashboard on `http://127.0.0.1:4747`.

Open it: `orca plugin open local.team-dashboard --panel tasks`

## How it works

- `web/` is generated from `dashboard/web` by `scripts/sync-web.mjs`: the dashboard's own `dash.js`, `lib/charts.js`, every `tabs/*.js` and `css/app.css` byte for byte, and `panel.html` made from `index.html` (top bar and `main.js` removed). Never edit those by hand. After changing `dashboard/web`, run `node orca-plugin/scripts/sync-web.mjs`; `orca plugin test` fails (`src/web-sync.test.ts`) while the two differ.
- `web/panel.js` and `web/panel.css` are this plugin's own. `panel.js` answers dash.js's `fetch("/api/data?days=N")` through `plugin.request('tasks.data')`, shows a bar with a message and retry when 4747 is down, and keeps the last snapshot in `localStorage` so the panel paints at once and refreshes after. `panel.css` adds a light palette (Orca's `html.light`) and a narrow-sidebar gutter.
- `src/worker.ts` fetches `/api/data`, `src/trim.ts` cuts it to what the Tasks tab reads (about 0.85 MB of the 1.6 MB) so the answer fits the 1 MiB limit, `src/protocol.ts` types the request.

## Develop

```sh
node orca-plugin/scripts/sync-web.mjs --check   # fails when web/ drifted from dashboard/web
orca plugin test orca-plugin && orca plugin check orca-plugin
npx -p typescript@5 tsc -p orca-plugin
orca plugin dev watch ./orca-plugin --check --shot ./orca-plugin/.orca/shots
```

An HTML panel counts as drawn when its page has loaded, so a shot shows the cached first paint, not the worker's answer.
