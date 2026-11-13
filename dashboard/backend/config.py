import os

HOME = os.path.expanduser("~")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS = os.path.realpath(os.environ.get("AGENT_TEAM_HOME") or os.path.dirname(HERE))
CLAUDE_GLOB = os.path.join(HOME, ".claude", "projects", "**", "*.jsonl")
CODEX_GLOB = os.path.join(HOME, ".codex", "sessions", "**", "*.jsonl")
COPILOT_GLOB = os.path.join(HOME, ".copilot", "session-state", "*", "events.jsonl")
HERMES_DB = os.path.join(HOME, ".hermes", "state.db")
RTK_DB = os.path.join(HOME, "Library", "Application Support", "rtk", "history.db")
SKILLS_DIR = os.environ.get("AGENT_SKILLS_DIR") or os.path.join(HOME, ".agents", "skills")
SKILL_LOCK = os.environ.get("AGENT_SKILL_LOCK") or os.path.join(os.path.dirname(SKILLS_DIR), ".skill-lock.json")
CLAUDE_SKILLS = os.path.join(HOME, ".claude", "skills")
CACHE_FILE = os.path.join(HERE, ".cache", "cache.json")
PRICES_FILE = os.path.join(HERE, "data", "prices.json")
PARSER_VERSION = 7
PORT = 4747
ORCA_TTL = 60
JS = "text/javascript; charset=utf-8"
STATIC = {"/js/main.js": JS, "/js/sheet.js": JS, "/js/dash.js": JS, "/js/md.js": JS,
          "/js/lib/charts.js": JS, "/js/tabs/overview.js": JS, "/js/tabs/roles.js": JS, "/js/tabs/repos.js": JS,
          "/js/tabs/runs.js": JS, "/js/tabs/sessions.js": JS, "/js/tabs/skills.js": JS, "/js/tabs/tokens.js": JS,
          "/js/tabs/overall.js": JS, "/js/tabs/quota.js": JS,
          "/css/app.css": "text/css; charset=utf-8",
          "/vendor/marked.min.js": JS}
