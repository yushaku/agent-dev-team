import json
import os

from ..config import CLAUDE_SKILLS, SKILLS_DIR
from .common import (CLAUDE_CMD_RE, ORCH_RE, TASK_RE, cmd_text, finish_first, hook_skill,
                            skills_in, ts_of)
from ..roles import note_discussion_tool

def parse_claude(path):
    calls = {}  # message.id -> [ts, model, effort, fin, cr, cw, out, reasoning]
    s = {"agent": "claude", "cwd": None, "branch": None, "start": None, "end": None,
         "first": None, "sid": None, "originator": None, "skills": [], "hooks": {}, "tasks": [], "dispatcher": False}
    for line in open(path, encoding="utf-8", errors="replace"):
        if '"hook_success"' in line:
            try:
                a = json.loads(line)
            except ValueError:
                a = {}
            at = a.get("attachment") or {}
            if at.get("type") == "hook_success":
                hook_skill(at.get("content"), s, ts_of(a.get("timestamp")))
            continue
        if '"type":"assistant"' not in line and '"type":"user"' not in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        t = d.get("type")
        if t not in ("assistant", "user"):
            continue
        ts = ts_of(d.get("timestamp"))
        if ts:
            s["start"] = ts if s["start"] is None else min(s["start"], ts)
            s["end"] = ts if s["end"] is None else max(s["end"], ts)
        s["cwd"] = s["cwd"] or d.get("cwd")
        s["branch"] = s["branch"] or d.get("gitBranch")
        s["sid"] = s["sid"] or d.get("sessionId")
        s["originator"] = s["originator"] or d.get("entrypoint")
        m = d.get("message") or {}
        content = m.get("content")
        if t == "user":
            txt = content if isinstance(content, str) else " ".join(
                c.get("text", "") for c in (content or []) if isinstance(c, dict) and c.get("type") == "text")
            if s["first"] is None and not d.get("isMeta") and txt and not txt.lstrip().startswith("<"):
                s["first"] = txt
            for tid in TASK_RE.findall(txt or ""):  # one session can take several Orca tasks
                s["tasks"].append([tid, ts])
            for raw in CLAUDE_CMD_RE.findall(txt or ""):  # slash command: count only real skills
                name = raw.split(":")[-1]
                if ":" in raw or any(os.path.isdir(os.path.join(d_, name)) for d_ in (SKILLS_DIR, CLAUDE_SKILLS)):
                    s["skills"].append([name, ts])
            continue
        u = m.get("usage")
        mid = m.get("id")
        model = m.get("model")
        if u and mid and model and model != "<synthetic>":
            calls[mid] = [ts, model, d.get("effort") or d.get("perTurnEffort"),
                          u.get("input_tokens") or 0, u.get("cache_read_input_tokens") or 0,
                          u.get("cache_creation_input_tokens") or 0, u.get("output_tokens") or 0,
                          (u.get("output_tokens_details") or {}).get("thinking_tokens") or 0, mid]
        if isinstance(content, list):
            for c in content:
                if not isinstance(c, dict) or c.get("type") != "tool_use":
                    continue
                inp = c.get("input") or {}
                note_discussion_tool(s, c.get("name"), inp)
                if c.get("name") == "Skill":
                    name = str(inp.get("skill") or inp.get("name") or inp.get("command") or "").split(":")[-1].strip("/ ")
                    if name:
                        s["skills"].append([name, ts])
                elif c.get("name") in ("Read", "Bash"):
                    for name in skills_in(json.dumps(inp)):
                        s["skills"].append([name, ts])
                    if c.get("name") == "Bash" and ORCH_RE.search(cmd_text(inp)):
                        s["dispatcher"] = True
    s["calls"] = sorted(calls.values(), key=lambda c: c[0] or 0)
    s["subagent"] = "/subagents/" in path
    if s["subagent"]:
        s["id"] = (s["sid"] or "?") + ":" + os.path.basename(path)[:-6]
    else:
        s["id"] = s["sid"] or os.path.basename(path)[:-6]
    return finish_first(s)
