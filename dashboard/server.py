#!/usr/bin/python3
"""Token metrics dashboard, local server on 127.0.0.1:4747.

GET /                 web/index.html (the metrics page)
GET /css/*.css, /js/*.js, /vendor/*   no-build static assets (whitelist in STATIC)
GET /api/team/skill?name=N  SKILL.md body for the side panel, see backend/team_docs.py
GET /api/data?days=N  aggregated JSON, computed fresh on each request.
GET /api/quota[?fresh=1]  agent quotas from scripts/quota.py (cached 15 min; fresh re-probes).

Sources (read only): ~/.claude/projects/**/*.jsonl, ~/.codex/sessions/**/*.jsonl,
~/.copilot/session-state/<uuid>/{workspace.yaml,events.jsonl} (GitHub Copilot CLI),
~/.hermes/state.db (Hermes sessions, read only),
`orca orchestration ... --json` (refreshed in a background thread every 60 s),
config.md + roles/*.md under the team root (model tiers), the skills dir (installed skills).
Parsed files are cached in .cache/cache.json keyed by path + size + mtime.
Python 3.9 stdlib only.
"""

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from backend import cache, config, orca, quota, team_docs, usage

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
        if u.path == "/api/quota":
            fresh = parse_qs(u.query).get("fresh", ["0"])[0] in ("1", "true")
            return self.send(200, json.dumps(quota.get(fresh), separators=(",", ":")).encode(), "application/json")
        if u.path == "/api/data":
            try:
                days = int(parse_qs(u.query).get("days", ["7"])[0])
            except ValueError:
                days = 7
            days = min(max(days, 1), 90)
            t0 = time.time()
            with cache.lock:
                data = usage.build(days)
                cache.save_cache()
            data["build_ms"] = int((time.time() - t0) * 1000)
            return self.send(200, json.dumps(data, separators=(",", ":")).encode(), "application/json")
        self.send(404, b"not found", "text/plain")

def main():
    os.makedirs(os.path.dirname(config.CACHE_FILE), exist_ok=True)
    cache.load_cache()
    threading.Thread(target=orca.orca_loop, daemon=True).start()
    ThreadingHTTPServer.allow_reuse_address = True
    srv = ThreadingHTTPServer(("127.0.0.1", config.PORT), Handler)
    print("team dashboard on http://localhost:%d" % config.PORT, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
