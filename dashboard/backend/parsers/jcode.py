import json
import os

from .common import TASK_RE, cmd_text, finish_first, note_orca, skills_in, ts_of
from ..roles import note_discussion_tool


def parse_jcode(path):
    """jcode session snapshot (~/.jcode/sessions/*.json): one JSON doc with messages;
    assistant messages carry token_usage (Anthropic-style split)."""
    with open(path, encoding="utf-8", errors="replace") as f:
        d = json.load(f)
    s = {"agent": "jcode", "cwd": d.get("working_dir"), "branch": None, "start": None, "end": None,
         "first": None, "id": d.get("id") or os.path.basename(path)[:-5], "originator": d.get("provider_key"),
         "skills": [], "hooks": {}, "subagent": bool(d.get("parent_id")), "tasks": [], "dispatcher": False}
    model = d.get("model") or "?"
    calls = []
    for m in d.get("messages") or []:
        ts = ts_of(m.get("timestamp"))
        if ts:
            s["start"] = ts if s["start"] is None else min(s["start"], ts)
            s["end"] = ts if s["end"] is None else max(s["end"], ts)
        content = m.get("content") or []
        if m.get("role") == "user":
            txt = " ".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
            if s["first"] is None and txt and not txt.lstrip().startswith("<"):
                s["first"] = txt
            for tid in TASK_RE.findall(txt):
                s["tasks"].append([tid, ts])
        elif m.get("role") == "assistant":
            u = m.get("token_usage") or {}
            if u:
                calls.append([ts, model, None, u.get("input_tokens") or 0, u.get("cache_read_input_tokens") or 0,
                              u.get("cache_creation_input_tokens") or 0, u.get("output_tokens") or 0, 0, None])
            for c in content:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    arg = c.get("input") or {}
                    note_discussion_tool(s, c.get("name"), arg)
                    for name in skills_in(json.dumps(arg)):
                        s["skills"].append([name, ts])
                    note_orca(s, cmd_text(arg.get("command") if isinstance(arg, dict) else arg), ts)
    s["start"] = s["start"] or ts_of(d.get("created_at"))
    s["end"] = s["end"] or ts_of(d.get("updated_at"))
    s["calls"] = calls
    return finish_first(s)
