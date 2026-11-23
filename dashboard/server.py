#!/usr/bin/python3
"""Token metrics dashboard, local server on 127.0.0.1:4747.

GET /                 web/index.html (the metrics page)
GET /css/*.css, /js/*.js, /vendor/*   no-build static assets (whitelist in STATIC)
GET /api/team/skill?name=N  SKILL.md body for the side panel, see backend/team_docs.py
GET /api/agent/summary?days=N[&repo=&run=&role=&agent=&format=json]  compact summary + issues for agents
GET /api/agent/run?id=RUN[&days=N&format=json]  one Run in detail (404 for an unknown id)
GET /api/data?days=N  aggregated JSON snapshot, refreshed in the background.
GET /api/cli-tools  executable inventory from this machine's PATH and local metadata.

Sources (read only): ~/.claude/projects/**/*.jsonl, ~/.codex/sessions/**/*.jsonl,
~/.copilot/session-state/<uuid>/{workspace.yaml,events.jsonl} (GitHub Copilot CLI),
~/.hermes/state.db (Hermes sessions, read only),
`orca orchestration ... --json` (refreshed in a background thread every 60 s),
Task Routing metadata/logs + skills/team-*/SKILL.md under the team root (selected settings and role defaults), the skills dir (installed skills).
Parsed files are cached in .cache/cache.json keyed by path + size + mtime.
Python 3.9 stdlib only.
"""

import os
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from backend import cache, cli_tools, config, insights, orca, snapshots, team_docs

# ---------------------------------------------------------------- http
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost"):  # DNS rebinding guard: local pages only
            return self.send(403, b"forbidden", "text/plain")
        u = urlparse(self.path)
        if u.path in ("/", "/index.html"):
            with open(os.path.join(config.HERE, "web", "index.html"), "rb") as f:
                return self.send(200, f.read(), "text/html; charset=utf-8")
        if u.path in config.STATIC:
            with open(os.path.join(config.HERE, "web", u.path.lstrip("/")), "rb") as f:
                return self.send(200, f.read(), config.STATIC[u.path])
        if u.path.startswith("/api/team/"):
            res = team_docs.handle(u.path, parse_qs(u.query))
            if res:
                return self.send(*res)
        if u.path.startswith("/api/agent/"):
            res = insights.handle(u.path, parse_qs(u.query))
            if res:
                return self.send(*res)
        if u.path == "/api/cli-tools":
            body = json.dumps(cli_tools.discover(), ensure_ascii=True).encode("utf-8")
            return self.send(200, body, "application/json")
        if u.path == "/api/data":
            try:
                days = int(parse_qs(u.query).get("days", ["7"])[0])
            except ValueError:
                days = 7
            days = min(max(days, 1), 90)
            try:
                body = snapshots.store.get(days)
            except RuntimeError:
                return self.send(503, b"Dashboard data is temporarily unavailable", "text/plain")
            return self.send(200, body, "application/json")
        self.send(404, b"not found", "text/plain")

def main():
    os.makedirs(os.path.dirname(config.CACHE_FILE), exist_ok=True)
    cache.load_cache()
    threading.Thread(target=orca.orca_loop, daemon=True).start()
    snapshots.store.pending.add(7)
    threading.Thread(target=snapshots.store.loop, daemon=True).start()
    ThreadingHTTPServer.allow_reuse_address = True
    srv = ThreadingHTTPServer(("127.0.0.1", config.PORT), Handler)
    print("team dashboard on http://localhost:%d" % config.PORT, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
