import json
import os
import time

from ..config import HERMES_DB
from .common import HERMES_ARGS_MARK, HERMES_SKILL_RE, ORCH_RE, cmd_text, finish_first
from ..roles import note_discussion_tool

_HERMES_CACHE = {"start": None, "ts": 0.0, "data": []}
_HERMES_TTL = 30

def parse_hermes(start):
    """Hermes sessions from the local state DB (read only). One call row per session carrying the
    aggregate token counts; the title and the skill_view calls decide the Orchestrator role.
    Cached for a short TTL: the DB is written by the live session, so a fresh read every request
    would dominate the build."""
    now = time.time()
    if _HERMES_CACHE["start"] == start and now - _HERMES_CACHE["ts"] < _HERMES_TTL:
        return _HERMES_CACHE["data"]
    import sqlite3
    if not os.path.exists(HERMES_DB):
        return []
    out = []
    try:
        conn = sqlite3.connect("file:%s" % HERMES_DB, uri=True, timeout=10)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, title, started_at, ended_at, input_tokens, output_tokens, "
            "cache_read_tokens, cache_write_tokens, reasoning_tokens, cwd, git_branch, model, source "
            "FROM sessions WHERE started_at IS NOT NULL AND started_at >= ? ORDER BY started_at DESC",
            (start,),
        ).fetchall()
        if not rows:
            return []
        ids = [r["id"] for r in rows]
        placeholders = ",".join("?" * len(ids))
        msgs = {}
        for m in conn.execute(
            "SELECT session_id, role, content, tool_name, tool_calls, timestamp FROM messages "
            "WHERE active=1 AND session_id IN (%s) ORDER BY session_id, timestamp" % placeholders, ids
        ):
            msgs.setdefault(m["session_id"], []).append(m)
        for r in rows:
            first = None
            skills = []
            dispatcher = False
            tool_state = {"tool_count": 0}
            for m in msgs.get(r["id"], []):
                if m["role"] == "user":
                    txt = (m["content"] or "").lstrip()
                    sk = HERMES_SKILL_RE.match(txt)
                    if sk:  # slash-invoked skill; the user's own text follows the injected skill body
                        skills.append([sk.group(1), m["timestamp"]])
                        txt = txt.split(HERMES_ARGS_MARK, 1)[1] if HERMES_ARGS_MARK in txt else ""
                    if first is None and txt and not txt.startswith(("<", "[")):
                        first = txt
                if m["role"] == "assistant" and m["tool_calls"] and not dispatcher:
                    try:
                        tool_calls = json.loads(m["tool_calls"])
                        for c in tool_calls:
                            fn = c.get("function") or {}
                            args = fn.get("arguments") or ""
                            note_discussion_tool(tool_state, fn.get("name"), args)
                            if ORCH_RE.search(cmd_text(args)):
                                dispatcher = True
                    except (ValueError, AttributeError, TypeError):
                        pass
                if m["role"] == "tool" and m["tool_name"] == "skill_view":
                    try:
                        d = json.loads(m["content"])
                        name = d.get("name")
                        if name:
                            skills.append([name, m["timestamp"]])
                    except (ValueError, AttributeError):
                        pass
            s = {
                "agent": "hermes", "cwd": r["cwd"], "branch": r["git_branch"],
                "start": r["started_at"], "end": r["ended_at"] or r["started_at"], "first": first,
                "sid": r["id"], "originator": "hermes:" + (r["source"] or "?"),
                "skills": skills, "subagent": False, "id": r["id"], "title": r["title"] or "", "dispatcher": dispatcher,
                "discussion_read": tool_state.get("discussion_read"),
                "calls": [[r["started_at"], r["model"] or "unknown", None, r["input_tokens"] or 0,
                           r["cache_read_tokens"] or 0, r["cache_write_tokens"] or 0, r["output_tokens"] or 0,
                           r["reasoning_tokens"] or 0, None]],
            }
            out.append(finish_first(s))
        conn.close()
    except Exception:
        pass
    _HERMES_CACHE["start"] = start
    _HERMES_CACHE["ts"] = now
    _HERMES_CACHE["data"] = out
    return out
