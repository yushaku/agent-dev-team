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
| `backend/parsers/` | Agent session parsers |
| `web/index.html` | Dashboard markup |
| `web/js/` | No-build ES modules (`main.js` shell, `dash.js` metrics, `sheet.js` skill side panel, `md.js` markdown) |
| `web/js/lib/charts.js` | Shared chart and DOM helpers |
| `web/js/tabs/` | Dashboard tab renderers |
| `web/css/app.css` | Dashboard styles |
| `web/vendor/` | Vendored browser libraries (marked, used by the skill panel) |
| `data/prices.json` | Model prices |
| `.cache/cache.json` | Runtime parse cache |
| `tests/` | Python and frontend tests, including the static whitelist check |

Edit `backend/parsers/<agent>.py` to change a parser.
Edit `backend/roles.py` to change a role rule.
Edit `web/js/tabs/<tab>.js` to change a dashboard tab.
Edit `web/js/sheet.js` to change the skill side panel.
Edit `web/css/app.css` to change styles.

The page shows only the token metrics. Team docs live on the docs site, linked from the top bar as `Tài liệu`.
