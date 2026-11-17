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

The page shows only the token metrics. Team docs live on the docs site, linked from the top bar as `Tài liệu`.

The Tasks run chart toggles between elapsed time and token consumption while keeping tasks in start order. Token bars chain in row order on a cumulative token axis. Orchestrator has a separate lane: its observed span includes idle time; dispatch, gate and inbox events mark recorded coordination, and gate intervals show PO wait. The sequence diagram shows one lane per worker, with chronological arrows for dispatches, PO gates and inbox messages. Reused workers keep their lane across tasks. Selecting an arrow by pointer or keyboard opens the full message in the dashboard detail modal. It reads inbox history without consuming messages, capped at the newest 500 per Run; unavailable or capped inbox data is labelled. Reused worker handles resolve to the dispatch active at the message timestamp; unknown addresses remain visible.
