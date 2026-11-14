# Team dashboard

Run the local server as a LaunchAgent (label `<label>`).
Restart it with `launchctl kickstart -k gui/$(id -u)/<label>`.
Read its log at `~/Library/Logs/team-dashboard.log`.

Run the tests with `python3 -m unittest discover -s tests`.
Run the frontend regression tests with `node --experimental-vm-modules --test tests/test_frontend.mjs`.

| Path | Purpose |
| --- | --- |
| `server.py` | HTTP entry point |
| `backend/` | Configuration, cache, parsers, usage, the live Runs endpoint (`live.py`, `live_fixture.py`) and the skill panel endpoint |
| `backend/parsers/` | Agent session parsers |
| `web/index.html` | Dashboard markup |
| `web/js/` | No-build ES modules (`main.js` shell, `dash.js` metrics, `sheet.js` skill side panel, `md.js` markdown) |
| `web/js/lib/charts.js` | Shared chart and DOM helpers |
| `web/js/tabs/` | Dashboard tab renderers (`live.js` is the Đang chạy tab) |
| `web/css/app.css` | Dashboard styles |
| `web/vendor/` | Vendored browser libraries (marked, used by the skill panel) |
| `.cache/cache.json` | Runtime parse cache |
| `.cache/live-state.json` | First-seen times of worker releases and task status changes, for the Đang chạy tab |
| `tests/` | Python and frontend tests, including the static whitelist check |

Edit `backend/parsers/<agent>.py` to change a parser.
Edit `backend/roles.py` to change a role rule.
Edit `web/js/tabs/<tab>.js` to change a dashboard tab.
Edit `web/js/sheet.js` to change the skill side panel.
Edit `web/css/app.css` to change styles.

## Token measurements

The dashboard measures tokens, not dollars. Total = fresh input + cache read + cache write + output; reasoning is already part of output. Run totals include worker retries and Orchestrator calls carrying an executed Orca Run ID. The Run table separates lifetime tokens from tokens in the selected date range.

Worker session reuse is split by Task assignment time. The dashboard preserves unassigned tokens and labels inference from a unique dispatch window. Attribution coverage is the fraction of observed tokens linked to a Run, not proof that every provider log is available. Hermes stores session totals only: multi-Run sessions stay unassigned, and date charts place totals on the session start date.

New Task specs carry one `Measurement:` JSON line (see the orchestrator Task spec rules). Historical Task names are estimates; missing round/cause values remain unknown. A spec approval does not count as delivery. Delivery requires a completed delivery Task, an approved gate on the close Task and no open Tasks; merge/cancellation requires explicit state. Lead time ends at delivery approval, and gate wait is the union of gate intervals, so overlapping gates are not counted twice.

The page shows only the token metrics. Team docs live on the docs site, linked from the top bar as `Tài liệu`.

## Đang chạy tab

`GET /api/live` returns the Orca Runs that are live right now (open tasks, a pending gate, or a worker terminal still held), each with its Orchestrator agent, tasks, workers, gates and recent events. It calls `orca orchestration run-list`, `task-list`, `worker-list`, `gate-list` and `inbox` on its own, independent of the 60 s refresh thread, and serves a snapshot at most 3 s old (a stale one is returned at once while a thread recomputes). Runs untouched for 3 days are never looked at, and open work with no activity for 12 hours does not keep a Run live unless a worker is running.

Orca has no release or transition timestamps. The first time `live.py` sees a worker released (or a task change status) it stores that moment in `.cache/live-state.json`, so `released_at` and the event log survive restarts. A worker first seen already released gets the Dispatch end time instead.

Add `?live-fixture=1` to the page URL to replay a scripted 150 s scenario (two Runs, spawn, report, question, PO gate, release) from `backend/live_fixture.py` when no Run is active.
