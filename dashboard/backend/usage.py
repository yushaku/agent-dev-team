import glob
import json
import os
import re
import statistics
import time
from datetime import datetime, timezone

from . import cache
from . import orca as orca_mod
from .parsers import hermes
from .config import (COPILOT_GLOB, HOME, PRICES_FILE, SKILLS_DIR, TEAMS)
from .parsers.common import local_date, parse_rtk, repo_of, ts_of
from .roles import assign_role, known_roles

# ---------------------------------------------------------------- config
def read_tiers():
    tiers, roles = {}, {}
    try:
        txt = open(os.path.join(TEAMS, "config.md"), encoding="utf-8").read()
        sec = txt.split("## Model tiers", 1)[1]
        for m in re.finditer(r"^\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|", sec, re.M):
            tiers[m.group(1)] = {"claude": m.group(2), "codex": m.group(3), "effort": m.group(4)}
    except (OSError, IndexError):
        pass
    for f in glob.glob(os.path.join(TEAMS, "roles", "*.md")):
        try:
            txt = open(f, encoding="utf-8").read()
        except OSError:
            continue
        m = re.search(r"\*\*Runs on:\*\*\s*(.+)", txt)
        if not m:
            continue
        line = m.group(1)
        agent = next((a.lower() for a in re.findall(r"\b(Codex|Claude|Hermes)\b", line)), None)
        tm = re.search(r"tier (top|work|fast)", line)
        roles[os.path.basename(f)[:-3]] = {"agent": agent, "tier": tm.group(1) if tm else None,
                                           "text": line.strip()[:200]}
    return {"tiers": tiers, "order": ["fast", "work", "top"], "roles": roles}

def load_prices():
    try:
        with open(PRICES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"models": {}}

def price_for(model, prices):
    ms = prices.get("models") or {}
    if model in ms:
        return ms[model]
    best = None
    for k in ms:
        if model and model.startswith(k) and (best is None or len(k) > len(best)):
            best = k
    return ms[best] if best else None

# ---------------------------------------------------------------- aggregate
def build(days):
    now = time.time()
    lt = time.localtime(now)
    start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - (days - 1), 0, 0, 0, 0, 0, -1))
    parsed = cache.load_files() + hermes.parse_hermes(start)
    prices = load_prices()
    roles = known_roles()
    tasks = orca_mod.orca_state["tasks"]
    dispatches = orca_mod.orca_state["dispatches"]
    # Claude: drop duplicate message ids across files (subagent files win, then oldest file).
    parsed.sort(key=lambda s: (s["agent"], not s.get("subagent"), s["start"] or 0))
    seen_ids = set()
    sessions, limits, run_tokens, task_tokens = [], [], {}, {}
    unpriced = set()
    for s in parsed:
        limits += s.get("limits") or []
        repo, wt = repo_of(s["cwd"])
        # Every Orca task the session took ([start ts, task]); a worker chat can be reused for several.
        stasks = sorted(((ts or 0, tasks[tid]) for tid, ts in s.get("tasks") or [] if tid in tasks), key=lambda x: x[0])
        if not stasks and s["start"] and s["cwd"]:
            for d in dispatches:  # fallback join: same worktree, same agent, inside the dispatch window
                if (d.get("agent") == s["agent"] and d.get("wt") and os.path.normpath(d["wt"]) == os.path.normpath(s["cwd"])
                        and d.get("from") and d["from"] - 120 <= s["start"] <= (d.get("to") or now) + 120
                        and d.get("task") in tasks):
                    stasks = [(0, tasks[d["task"]])]
                    break
        task = next((t for _, t in stasks if t.get("role")), stasks[0][1] if stasks else None)
        role, role_src = assign_role(task, s)
        row = {"id": s["id"], "agent": s["agent"], "repo": repo, "worktree": wt, "branch": s.get("branch"),
               "role": role, "role_src": role_src, "originator": (s.get("originator") or "?") + (" (subagent)" if s.get("subagent") else ""),
               "start": s["start"], "end": s["end"], "preview": s["preview"], "title": s.get("title") or "",
               "task_id": task["id"] if task else None, "task_title": task["title"] if task else None,
               "run_id": task["run"] if task else None,
               "calls": 0, "fin": 0, "cr": 0, "cw": 0, "out": 0, "reason": 0, "cost": 0.0, "unpriced": 0, "prem": 0,
               "snapshot": s.get("snapshot"),
               "ctx": [], "days": {}, "hours": {}, "t0": None, "mix": {}, "models": {}, "skills": {}}
        session_runs = set()
        for c in s["calls"]:
            ts, model, eff, fin, cr, cw, out, reason, mid = c[:9]
            prem = c[9] if len(c) > 9 else 0  # Copilot premium requests
            if mid:
                if mid in seen_ids:
                    continue
                seen_ids.add(mid)
            tot = fin + cr + cw + out
            if stasks:  # tokens go to the task the session was working on at that call
                ct = stasks[0][1]
                for t0, t in stasks:
                    if ts and t0 <= ts:
                        ct = t
                rt = run_tokens.setdefault(ct["run"], {"claude": 0, "codex": 0, "copilot": 0, "sessions": 0})
                rt[s["agent"]] = rt.get(s["agent"], 0) + tot
                if ct["run"] not in session_runs:
                    session_runs.add(ct["run"])
                    rt["sessions"] += 1
                tt = task_tokens.setdefault(ct["id"], {"claude": 0, "codex": 0, "copilot": 0})
                tt[s["agent"]] = tt.get(s["agent"], 0) + tot
            if not ts or ts < start:
                continue
            p = None if s["agent"] == "copilot" else price_for(model, prices)
            cost = None
            if s["agent"] == "copilot":  # Copilot Free: no per token price, premium requests instead
                cost = 0.0
            elif p:
                cost = (fin * p.get("input", 0) + cr * p.get("cache_read", 0) + cw * p.get("cache_write", 0)
                        + out * p.get("output", 0)) / 1e6
                row["cost"] += cost
            else:
                row["unpriced"] += tot
                unpriced.add(model)
            row["calls"] += 1
            row["prem"] += prem
            row["fin"] += fin
            row["cr"] += cr
            row["cw"] += cw
            row["out"] += out
            row["reason"] += reason
            row["ctx"].append(fin + cr + cw)
            dk = local_date(ts)
            row["t0"] = ts if row["t0"] is None else min(row["t0"], ts)
            hk = dk + " " + time.strftime("%H", time.localtime(ts))
            for b in (row["hours"].setdefault(hk, [0, 0, 0, 0, 0.0, 0]), row["days"].setdefault(dk, [0, 0, 0, 0, 0.0, 0])):
                b[0] += fin
                b[1] += cr
                b[2] += cw
                b[3] += out
                b[4] += cost or 0
                b[5] += prem
            key = "%s|%s" % (model, eff or "?")
            row["mix"][key] = row["mix"].get(key, 0) + tot
            row["models"][model] = row["models"].get(model, 0) + tot
        if row["calls"] == 0:
            continue
        for name, ts in s["skills"]:
            if ts and ts >= start:
                k = row["skills"].setdefault(name, [0, 0])
                k[0] += 1
                k[1] = max(k[1], ts)
        row["hooks"] = {n: h[1] for n, h in (s.get("hooks") or {}).items() if h[0] and h[0] >= start}
        row["model"] = max(row["models"], key=row["models"].get)
        effs = {}
        for k, v in row["mix"].items():
            if k.startswith(row["model"] + "|"):
                effs[k.split("|", 1)[1]] = effs.get(k.split("|", 1)[1], 0) + v
        row["effort"] = max(effs, key=effs.get) if effs else "?"
        row["ctx_med"] = int(statistics.median(row["ctx"]))
        row["ctx_max"] = max(row["ctx"])
        row["total"] = row["fin"] + row["cr"] + row["cw"] + row["out"]
        sessions.append(row)
    sessions.sort(key=lambda r: r["start"] or 0, reverse=True)
    runs = []
    for r in orca_mod.orca_state["runs"]:
        rr = dict(r)
        rr["tokens"] = run_tokens.get(r["id"], {"claude": 0, "codex": 0, "copilot": 0, "sessions": 0})
        rr["tasks"] = [dict(t, tokens=task_tokens.get(t["id"], {"claude": 0, "codex": 0, "copilot": 0})) for t in r["tasks"]]
        runs.append(rr)
    installed = sorted(d for d in os.listdir(SKILLS_DIR)
                       if os.path.isfile(os.path.join(SKILLS_DIR, d, "SKILL.md"))) if os.path.isdir(SKILLS_DIR) else []
    return {
        "generated_at": now, "days": days, "range_start": start,
        "dates": [local_date(start + 86400 * i + 3600) for i in range(days)],
        "sessions": sessions,
        "codex_limit": codex_limit(limits, now),
        "copilot_dirs": len(glob.glob(os.path.join(HOME, ".copilot", "session-state", "*", ""))),
        "orca": {"available": orca_mod.orca_state["available"], "error": orca_mod.orca_state["error"],
                 "fetched_at": orca_mod.orca_state["fetched_at"], "runs": runs},
        "roles_cfg": read_tiers(), "known_roles": roles,
        "skills_installed": installed,
        "prices": prices, "unpriced_models": sorted(m for m in unpriced if m),
        "rtk": parse_rtk(time.strftime("%Y-%m-%d", time.localtime(start))),
    }

def codex_limit(samples, now):
    weekly = [x for x in samples if x[0] and x[2] == 10080 and x[3]]
    if not weekly:
        return None
    ts, used, window, resets, plan = max(weekly, key=lambda x: x[0])
    wstart = resets - window * 60
    stale = resets < now
    # used % since the last reset, one point per sample (resets_at jitters by a few seconds)
    hist = sorted({(x[0], x[1]) for x in weekly if abs(x[3] - resets) < 3600 and x[0] >= wstart - 60})
    if len(hist) > 400:
        step = len(hist) / 400.0
        hist = [hist[int(i * step)] for i in range(400)] + [hist[-1]]
    history = [] if stale else [[round(t, 1), u] for t, u in hist]
    if stale:  # the window rolled over and no newer sample exists yet
        used = 0.0
        wstart, resets = resets, resets + window * 60
    elapsed = max((now - wstart) / 86400, 1e-3)
    pace = used / elapsed
    hit = wstart + 100 / pace * 86400 if pace > 0 else None
    return {"used": used, "resets_at": resets, "window_start": wstart, "sample_at": ts, "plan": plan, "history": history,
            "pace_per_day": pace, "projected_hit": hit, "hits_before_reset": bool(hit and hit < resets),
            "stale": stale}
