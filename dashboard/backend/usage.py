import glob
import os
import re
import statistics
import time

from . import cache
from . import orca as orca_mod
from .parsers import hermes
from .config import COPILOT_GLOB, HOME, SKILLS_DIR, TEAMS
from .parsers.common import local_date, parse_rtk, repo_of
from .roles import assign_role, known_roles


def read_tiers():
    tiers, roles = {}, {}
    try:
        with open(os.path.join(TEAMS, "skills", "orchestrator", "references", "coding-agents.md"), encoding="utf-8") as f:
            sec = f.read().split("## Model tiers", 1)[1].split("## Routing", 1)[0]
        for line in sec.splitlines():
            cells = [v.strip().strip("`") for v in line.strip("|").split("|")]
            if len(cells) == 6 and cells[0] in ("top", "work", "fast"):
                tiers[cells[0]] = dict(zip(("claude", "codex", "cursor", "copilot", "effort"), cells[1:]))
    except (OSError, IndexError):
        pass
    for f in glob.glob(os.path.join(TEAMS, "roles", "*.md")):
        try:
            with open(f, encoding="utf-8") as source:
                txt = source.read()
        except OSError:
            continue
        m = re.search(r"\*\*Runs on:\*\*\s*(.+)", txt)
        if not m:
            continue
        line = m.group(1)
        pref = re.search(r"prefers (\w+)", line)
        tm = re.search(r"tier (top|work|fast)", line)
        roles[os.path.basename(f)[:-3]] = {"agent": pref.group(1) if pref else None,
                                           "tier": tm.group(1) if tm else None, "text": line.strip()[:200]}
    return {"tiers": tiers, "order": ["fast", "work", "top"], "roles": roles}


def build(days):
    now = time.time()
    lt = time.localtime(now)
    start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - (days - 1), 0, 0, 0, 0, 0, -1))
    parsed = cache.load_files() + hermes.parse_hermes(0)
    tasks = orca_mod.orca_state["tasks"]
    dispatches = orca_mod.orca_state["dispatches"]
    run_ids = {r["id"] for r in orca_mod.orca_state["runs"]}
    disp_index = {}
    for d in dispatches:
        if d.get("wt") and d.get("from") and d.get("task") in tasks:
            disp_index.setdefault((d.get("agent"), os.path.normpath(d["wt"])), []).append(d)
    parsed.sort(key=lambda s: (s["agent"], not s.get("subagent"), s["start"] or 0))
    seen_ids = set()
    sessions, limits, run_tokens, task_tokens, run_sessions = [], [], {}, {}, {}
    run_window, orch_tokens = {}, {}
    attribution = dict(total=0, assigned=0, unassigned=0, inferred=0, aggregate=0, undated=0)
    for s in parsed:
        limits += s.get("limits") or []
        repo, wt = repo_of(s["cwd"])
        task_events = [(ts or s["start"] or 0, tid) for tid, ts in s.get("tasks") or []]
        run_events = [(ts or s["start"] or 0, rid) for rid, ts in s.get("runs") or []]
        aggregate = s.get("aggregate", False)
        s_disp = disp_index.get((s["agent"], os.path.normpath(s["cwd"])), []) if s["cwd"] else []
        rows = {}
        for c in sorted(s["calls"], key=lambda c: c[0] or 0):
            ts, model, eff, fin, cr, cw, out, reason, mid = c[:9]
            if mid:
                key = (s["agent"], mid)
                if key in seen_ids:
                    continue
                seen_ids.add(key)
            tot = fin + cr + cw + out
            if not ts:
                attribution["undated"] += tot
                continue
            if ts > now:
                continue
            task, rid, source = None, None, "unassigned"
            if aggregate:
                # shortcut: aggregate logs cannot be split across tasks or dates; keep multi-run totals unassigned.
                tids, rids = {x[1] for x in task_events}, {x[1] for x in run_events}
                if len(tids) == 1 and not rids:
                    task = tasks.get(next(iter(tids)))
                elif len(rids) == 1 and not tids:
                    rid = next(iter(rids))
            elif task_events:
                active = [tid for t0, tid in task_events if t0 <= ts]
                task = tasks.get(active[-1]) if active else None
            elif run_events:
                active = [r for t0, r in run_events if t0 <= ts]
                rid = active[-1] if active else None
            elif not s.get("dispatcher"):
                candidates = {d["task"] for d in s_disp if d["from"] <= ts <= (d.get("to") or now)}
                if len(candidates) == 1:
                    task = tasks[next(iter(candidates))]
                    source = "dispatch_window"
            if task:
                rid = task["run"]
            if rid not in run_ids:
                rid, task, source = None, None, "unassigned"
            if rid and source == "unassigned":
                source = "task_id" if task else "run_id"
            role, role_src = assign_role(task, s)
            if rid and not task:
                role, role_src = "orchestrator", "dispatch"
            if rid:
                rt = run_tokens.setdefault(rid, {})
                rt[s["agent"]] = rt.get(s["agent"], 0) + tot
                run_sessions.setdefault(rid, set()).add((s["agent"], s["id"]))
                if role == "orchestrator":
                    orch = orch_tokens.setdefault(rid, {})
                    orch[s["agent"]] = orch.get(s["agent"], 0) + tot
                if task:
                    tt = task_tokens.setdefault(task["id"], {})
                    tt[s["agent"]] = tt.get(s["agent"], 0) + tot
            if ts < start:
                continue
            attribution["total"] += tot
            attribution["assigned" if rid else "unassigned"] += tot
            attribution["inferred"] += tot if source == "dispatch_window" else 0
            attribution["aggregate"] += tot if aggregate else 0
            if rid:
                rw = run_window.setdefault(rid, {})
                rw[s["agent"]] = rw.get(s["agent"], 0) + tot
            key = (rid, task["id"] if task else None, role, source)
            if key not in rows:
                rows[key] = {"id": s["id"], "session_id": s["id"], "agent": s["agent"], "repo": repo,
                    "worktree": wt, "branch": s.get("branch"), "role": role, "role_src": role_src,
                    "originator": (s.get("originator") or "?") + (" (subagent)" if s.get("subagent") else ""),
                    "start": s["start"], "end": s["end"], "preview": s["preview"], "title": s.get("title") or "",
                    "task_id": task["id"] if task else None, "task_title": task["title"] if task else None,
                    "run_id": rid, "attribution": source, "aggregate": aggregate,
                    "calls": 0, "fin": 0, "cr": 0, "cw": 0, "out": 0, "reason": 0, "prem": 0,
                    "snapshot": s.get("snapshot"), "ctx": [], "days": {}, "hours": {}, "t0": None,
                    "mix": {}, "models": {}, "skills": {}}
            row = rows[key]
            row["calls"] += 1
            prem = c[9] if len(c) > 9 else 0
            for field, value in (("fin", fin), ("cr", cr), ("cw", cw), ("out", out), ("reason", reason), ("prem", prem)):
                row[field] += value
            if not aggregate:
                row["ctx"].append(fin + cr + cw)
            dk = local_date(ts)
            row["t0"] = ts if row["t0"] is None else min(row["t0"], ts)
            hk = dk + " " + time.strftime("%H", time.localtime(ts))
            for b in (row["hours"].setdefault(hk, [0, 0, 0, 0, 0]), row["days"].setdefault(dk, [0, 0, 0, 0, 0])):
                for i, value in enumerate((fin, cr, cw, out, prem)):
                    b[i] += value
            mix_key = "%s|%s" % (model, eff or "?")
            row["mix"][mix_key] = row["mix"].get(mix_key, 0) + tot
            row["models"][model] = row["models"].get(model, 0) + tot
        for name, ts in s["skills"]:
            if not ts or ts < start:
                continue
            tids = [tid for t0, tid in task_events if t0 <= ts]
            rids = [rid for t0, rid in run_events if t0 <= ts]
            candidates = [r for r in rows.values() if
                          (tids and r["task_id"] == tids[-1]) or
                          (not tids and rids and r["run_id"] == rids[-1])]
            target = candidates[0] if candidates else next(iter(rows.values()), None)
            if target:
                value = target["skills"].setdefault(name, [0, 0])
                value[0] += 1
                value[1] = max(value[1], ts)
        for i, row in enumerate(rows.values()):
            if len(rows) > 1:
                row["id"] += ":part:" + str(i)
            row["hooks"] = {n: h[1] for n, h in (s.get("hooks") or {}).items() if h[0] and h[0] >= start}
            row["model"] = max(row["models"], key=row["models"].get)
            effs = {}
            for k, v in row["mix"].items():
                if k.startswith(row["model"] + "|"):
                    effs[k.split("|", 1)[1]] = effs.get(k.split("|", 1)[1], 0) + v
            row["effort"] = max(effs, key=effs.get) if effs else "?"
            row["ctx_med"] = int(statistics.median(row["ctx"])) if row["ctx"] else None
            row["ctx_max"] = max(row["ctx"]) if row["ctx"] else None
            if aggregate:
                row["calls"] = None
            row["total"] = row["fin"] + row["cr"] + row["cw"] + row["out"]
            sessions.append(row)
    sessions.sort(key=lambda r: r["start"] or 0, reverse=True)
    runs = []
    for r in orca_mod.orca_state["runs"]:
        rr = dict(r)
        rr["tokens"] = dict(run_tokens.get(r["id"], {}), sessions=len(run_sessions.get(r["id"], [])))
        rr["window_tokens"] = run_window.get(r["id"], {})
        rr["orchestrator_by_agent"] = orch_tokens.get(r["id"], {})
        rr["orchestrator_tokens"] = sum(rr["orchestrator_by_agent"].values())
        rr["worker_tokens"] = sum(v for k, v in rr["tokens"].items() if k != "sessions") - rr["orchestrator_tokens"]
        rr["tasks"] = [dict(t, tokens=task_tokens.get(t["id"], {})) for t in r["tasks"]]
        rr["fix_tokens_by_cause"] = {}
        for t in rr["tasks"]:
            measurement = t.get("measurement") or {}
            if measurement.get("kind") == "fix":
                cause = measurement.get("cause") or "unknown"
                counts = rr["fix_tokens_by_cause"].setdefault(cause, {})
                for agent, value in t["tokens"].items():
                    counts[agent] = counts.get(agent, 0) + value
        runs.append(rr)
    installed = sorted(d for d in os.listdir(SKILLS_DIR)
                       if os.path.isfile(os.path.join(SKILLS_DIR, d, "SKILL.md"))) if os.path.isdir(SKILLS_DIR) else []
    return {
        "generated_at": now, "days": days, "range_start": start,
        "dates": [local_date(start + 86400 * i + 3600) for i in range(days)],
        "sessions": sessions, "attribution": attribution,
        "codex_limit": codex_limit(limits, now),
        "copilot_dirs": len(glob.glob(os.path.join(HOME, ".copilot", "session-state", "*", ""))),
        "orca": {"available": orca_mod.orca_state["available"], "error": orca_mod.orca_state["error"],
                 "fetched_at": orca_mod.orca_state["fetched_at"], "runs": runs},
        "roles_cfg": read_tiers(), "known_roles": known_roles(), "skills_installed": installed,
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
