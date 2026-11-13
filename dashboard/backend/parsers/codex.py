import json
import os

from .common import (ORCH_RE, TASK_RE, cmd_text, finish_first, hook_skill, skills_in, ts_of)
from ..roles import note_discussion_tool

def codex_call(ts, model, eff, u):
    inp = u.get("input_tokens") or 0
    cached = u.get("cached_input_tokens") or 0
    return [ts, model or "?", eff, max(inp - cached, 0), cached, u.get("cache_write_input_tokens") or 0,
            u.get("output_tokens") or 0, u.get("reasoning_output_tokens") or 0, None]

def parse_codex(path):
    s = {"agent": "codex", "cwd": None, "branch": None, "start": None, "end": None,
         "first": None, "id": None, "originator": None, "skills": [], "hooks": {}, "subagent": False, "limits": [],
         "tasks": [], "dispatcher": False}
    turns = {}
    cur = (None, None)
    records = []
    counts = []
    last_total = None
    for line in open(path, encoding="utf-8", errors="replace"):
        head = line[:220]
        if ('"custom_tool_call_output"' in head or '"function_call_output"' in head
                or '"reasoning"' in head or '"item_completed"' in head or '"world_state"' in head):
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        t = d.get("type")
        p = d.get("payload") or {}
        ts = ts_of(d.get("timestamp"))
        if ts:
            s["start"] = ts if s["start"] is None else min(s["start"], ts)
            s["end"] = ts if s["end"] is None else max(s["end"], ts)
        if t == "session_meta":
            s["id"] = p.get("id") or p.get("session_id")
            s["cwd"] = p.get("cwd")
            s["originator"] = p.get("originator")
            s["branch"] = (p.get("git") or {}).get("branch")
        elif t == "turn_context":
            cur = (p.get("model"), p.get("effort") or p.get("reasoning_effort"))
            if p.get("turn_id"):
                turns[p["turn_id"]] = cur
            s["cwd"] = s["cwd"] or p.get("cwd")
        elif t == "token_usage_record":
            u = p.get("usage") or {}
            model, eff = turns.get(p.get("turn_id"), cur)
            records.append(codex_call(ts, model, eff, u))
        elif t == "event_msg" and p.get("type") == "token_count":
            info = p.get("info") or {}
            tot = (info.get("total_token_usage") or {}).get("total_tokens")
            if info.get("last_token_usage") and tot != last_total:
                last_total = tot
                counts.append(codex_call(ts, cur[0], cur[1], info["last_token_usage"]))
            rl = p.get("rate_limits") or {}
            pr = rl.get("primary") or {}
            if pr.get("used_percent") is not None:
                smp = [ts, pr.get("used_percent"), pr.get("window_minutes"), pr.get("resets_at"), rl.get("plan_type")]
                if not s["limits"] or s["limits"][-1][1:] != smp[1:]:
                    s["limits"].append(smp)
        elif t == "response_item":
            pt = p.get("type")
            if pt == "message" and p.get("role") == "developer":
                for c in p.get("content") or []:
                    if isinstance(c, dict):
                        hook_skill(c.get("text"), s, ts)
            if pt == "message" and p.get("role") == "user":
                txt = " ".join(c.get("text", "") for c in (p.get("content") or []) if isinstance(c, dict))
                st = txt.lstrip()
                if s["first"] is None and txt and not st.startswith("<") and not st.startswith("# AGENTS.md"):
                    s["first"] = txt
                for tid in TASK_RE.findall(txt):
                    s["tasks"].append([tid, ts])
            elif pt in ("custom_tool_call", "function_call", "local_shell_call") and p.get("name") != "apply_patch":
                arg = p.get("input") or p.get("arguments") or p.get("action") or ""
                note_discussion_tool(s, p.get("name"), arg)
                for name in skills_in(str(arg)):
                    s["skills"].append([name, ts])
                if ORCH_RE.search(cmd_text(arg)):
                    s["dispatcher"] = True
    s["calls"] = records or counts
    s["id"] = s["id"] or os.path.basename(path)[:-6]
    return finish_first(s)
