import json
import os
import re
import time
from datetime import datetime, timezone

from ..config import HOME, RTK_DB

# ---------------------------------------------------------------- helpers
SKILL_RE = re.compile(r"/skills/([A-Za-z0-9._-]+)/SKILL\.md")
ORCA_SKILL_RE = re.compile(r"orca skills get ([A-Za-z0-9._-]+)")
TASK_RE = re.compile(r"Your task ID is:\s*(task_[0-9a-f]+)")
# A coordinator starts workers: the command itself, not a mention, a grep or --help.
ORCH_RE = re.compile(r"(?:^|[;&|(\n]|\bsh\s+-l?c\s+['\"])\s*(?:rtk\s+(?:proxy\s+)?)?orca\s+orchestration\s+"
                     r"(?:worker-start|task-create|dispatch)\b(?![^;&|\n]*--help)")
CMD_STR_RE = re.compile(r"""\bcmd\s*:\s*(["'`])((?:\\.|(?!\1).)*)\1""", re.S)  # Codex exec: exec_command({cmd:"..."})
CLAUDE_CMD_RE = re.compile(r"<command-name>/([^<\s]+)</command-name>")
HERMES_SKILL_RE = re.compile(r'^\[IMPORTANT: The user has invoked the "([^"]+)" skill')
HERMES_ARGS_MARK = "The user has provided the following instruction alongside the skill invocation:"
COPILOT_TYPES = ('"type":"session.start"', '"type":"session.resume"', '"type":"user.message"',
                 '"type":"session.usage_record"', '"type":"session.usage_checkpoint"', '"type":"session.shutdown"',
                 '"type":"model.model_call_success"', '"type":"skill.invoked"', '"type":"skill.invoked_ref"')

# Skills a hook injects into the context (no load by the agent): header -> skill name.
HOOK_MARKS = [("PONYTAIL MODE ACTIVE", "ponytail")]
HOOK_LEVEL_RE = re.compile(r"level:\s*([A-Za-z0-9_-]+)")

def ts_of(s):
    """ISO string (Z or naive UTC like Orca's '2026-11-06 09:10:55') to epoch seconds."""
    if not s:
        return None
    try:
        s = s.replace("Z", "+00:00").replace(" ", "T")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.timestamp()
    except ValueError:
        return None

def local_date(ts):
    return time.strftime("%Y-%m-%d", time.localtime(ts))

def repo_of(cwd):
    """(repo, worktree) from a working directory; never returns the path itself."""
    if not cwd:
        return "?", "?"
    p = os.path.normpath(cwd)
    ws = os.path.join(HOME, "orca", "workspaces") + os.sep
    pj = os.path.join(HOME, "orca", "projects") + os.sep
    if p.startswith(ws):
        parts = p[len(ws):].split(os.sep)
        return parts[0], (parts[1] if len(parts) > 1 else "(main)")
    if p.startswith(pj):
        return p[len(pj):].split(os.sep)[0], "(main)"
    parts = [x for x in p.split(os.sep) if x]
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return (parts[0] if parts else "?"), "?"

def cmd_text(v):
    """Shell command(s) of a tool call: JSON {command|cmd}, an argv list, or Codex exec JS source."""
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return "\n".join(m[1].replace("\\n", "\n") for m in CMD_STR_RE.findall(v))
    if isinstance(v, dict):
        v = v.get("command") or v.get("cmd") or ""
    if isinstance(v, list):
        v = [str(e) for e in v]
        v = "\n".join(e for e in v if " " in e) or " ".join(v)
    return v if isinstance(v, str) else ""

def hook_skill(text, s, ts):
    """Record a hook-injected skill once per session, with its level when the header has one."""
    head = (text or "")[:200]
    for mark, name in HOOK_MARKS:
        if mark in head and name not in s["hooks"]:
            m = HOOK_LEVEL_RE.search(head)
            s["hooks"][name] = [ts, m.group(1) if m else ""]

def skills_in(text):
    out = SKILL_RE.findall(text or "")
    out += ORCA_SKILL_RE.findall(text or "")
    return out

def finish_first(s):
    """Keep only a 160 char preview, the role hint and the Orca task id of the first prompt."""
    from ..roles import discussion_role, known_roles, role_from_text
    txt = s.pop("first") or ""
    roles = known_roles()
    s["preview"] = re.sub(r"\s+", " ", txt).strip()[:160]
    s["role_line"] = role_from_text(txt, roles)
    # Discussion roles are PO sessions; a subagent (Hermes title "Subagent: ...") never is one.
    sub = s.get("subagent") or (s.get("title") or "").startswith("Subagent:")
    s["discussion"] = None if sub else discussion_role(txt) or s.get("discussion_read")
    seen = set()
    s["tasks"] = [x for x in s.get("tasks") or [] if not (x[0] in seen or seen.add(x[0]))]
    m = TASK_RE.search(txt)
    if m and m.group(1) not in seen:
        s["tasks"].insert(0, [m.group(1), s["start"]])
    return s

def parse_rtk(start_date=None):
    """RTK (Rust Token Killer) savings from its local history DB, read only."""
    import sqlite3
    if not os.path.exists(RTK_DB):
        return {"available": False}
    w = " WHERE timestamp >= ?" if start_date else ""
    p = (start_date,) if start_date else ()
    try:
        conn = sqlite3.connect("file://%s" % RTK_DB, uri=True, timeout=10)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        s = cur.execute("SELECT COUNT(*) AS n, SUM(input_tokens) AS inp, SUM(output_tokens) AS outp, "
                        "SUM(saved_tokens) AS saved, SUM(exec_time_ms) AS ms FROM commands" + w, p).fetchone()
        inp = s["inp"] or 0
        summary = {"commands": s["n"] or 0, "input": inp, "output": s["outp"] or 0,
                   "saved": s["saved"] or 0, "pct": round((s["saved"] or 0) / (inp or 1) * 100, 1), "time_ms": s["ms"] or 0}
        by_cmd = [{"cmd": r["cmd"], "n": r["n"], "saved": r["saved"] or 0, "input": r["inp"] or 0,
                   "output": r["outp"] or 0, "pct": round((r["saved"] or 0) / (r["inp"] or 1) * 100, 1)} for r in cur.execute(
            "SELECT rtk_cmd AS cmd, COUNT(*) AS n, SUM(saved_tokens) AS saved, SUM(input_tokens) AS inp, "
            "SUM(output_tokens) AS outp FROM commands" + w + " GROUP BY rtk_cmd ORDER BY saved DESC LIMIT 15", p)]
        daily = [{"date": r["d"], "n": r["n"], "saved": r["saved"] or 0, "input": r["inp"] or 0,
                  "output": r["outp"] or 0, "pct": round((r["saved"] or 0) / (r["inp"] or 1) * 100, 1)} for r in cur.execute(
            "SELECT substr(timestamp, 1, 10) AS d, COUNT(*) AS n, SUM(saved_tokens) AS saved, "
            "SUM(input_tokens) AS inp, SUM(output_tokens) AS outp FROM commands" + w + " GROUP BY d ORDER BY d", p)]
        wp = ("timestamp >= ?" if start_date else "1=1") + " AND project_path != ''"
        pp = (start_date,) if start_date else ()
        by_project = [{"project": os.path.relpath(r["p"], HOME), "n": r["n"], "saved": r["saved"] or 0,
                       "pct": round((r["saved"] or 0) / (r["inp"] or 1) * 100, 1)} for r in cur.execute(
            "SELECT project_path AS p, COUNT(*) AS n, SUM(saved_tokens) AS saved, SUM(input_tokens) AS inp "
            "FROM commands WHERE " + wp + " GROUP BY p ORDER BY saved DESC LIMIT 15", pp)]
        conn.close()
        return {"available": True, "summary": summary, "by_cmd": by_cmd, "daily": daily, "by_project": by_project}
    except Exception:
        return {"available": False}
