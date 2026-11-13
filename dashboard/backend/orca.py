import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import cache
from .config import ORCA_TTL
from .parsers.common import repo_of, ts_of
from .roles import known_roles, role_from_title

orca_state = {"available": None, "runs": [], "tasks": {}, "dispatches": [], "fetched_at": None, "error": None}

def orca(*args):
    try:
        r = subprocess.run(["orca", "orchestration", *args, "--json", "--full"],
                           capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            return None
        return json.loads(r.stdout).get("result")
    except (OSError, ValueError, subprocess.SubprocessError):
        return None

def refresh_orca():
    runs, cursor = [], None
    for _ in range(20):
        res = orca("run-list", "--limit", "100", *(["--cursor", cursor] if cursor else []))
        if res is None:
            orca_state.update(available=False, error="orca không chạy được", fetched_at=time.time())
            return
        runs += res.get("runs") or []
        cursor = res.get("nextCursor")
        if not cursor or not res.get("runs"):
            break

    def per_run(run):
        rid = run["id"]
        return (rid, orca("task-list", "--run", rid), orca("gate-list", "--run", rid),
                orca("worker-list", "--run", rid, "--limit", "100"))

    with ThreadPoolExecutor(6) as ex:
        details = list(ex.map(per_run, runs))
    known = dict(cache.cache["dispatch"])
    todo = []
    for _, _, _, wl in details:
        for w in (wl or {}).get("workers") or []:
            did = w.get("dispatchId")
            if did and (did not in known or known[did].get("open")):
                todo.append(did)

    def show(did):
        res = orca("worker-show", "--dispatch", did)
        if not res:
            return did, None
        disp = res.get("dispatch") or {}
        wk = res.get("worker") or {}
        eff = ((wk.get("startOptions") or {}).get("launch") or {}).get("effective") or {}
        wt = (wk.get("worktreeId") or "").split("::", 1)[-1]
        return did, {"task": disp.get("taskId"), "agent": eff.get("agent"), "model": eff.get("model"),
                     "effort": eff.get("effort"), "wt": wt, "from": ts_of(disp.get("dispatchedAt")),
                     "to": ts_of(disp.get("completedAt")), "status": disp.get("status"),
                     "open": disp.get("status") not in ("completed", "failed", "cancelled", "abandoned")}

    with ThreadPoolExecutor(6) as ex:
        for did, info in ex.map(show, todo):
            if info:
                known[did] = info
    roles = known_roles()
    out_runs, tasks = [], {}
    for run, (rid, tl, gl, _) in zip(runs, details):
        rtasks = []
        for t in (tl or {}).get("tasks") or []:
            title = t.get("task_title") or t.get("title") or ""
            rec = {"id": t["id"], "run": rid, "title": title[:120], "role": role_from_title(title, roles),
                   "status": t.get("status"), "created": ts_of(t.get("created_at")),
                   "completed": ts_of(t.get("completed_at")), "agent": None, "model": None, "effort": None,
                   "repo": None, "worktree": None}
            rtasks.append(rec)
            tasks[t["id"]] = rec
        gates = []
        for g in (gl or {}).get("gates") or []:
            res = (g.get("resolution") or "").strip()
            kind = ("pending" if g.get("status") != "resolved" else
                    "approve" if res.lower().startswith("approve") else
                    "changes" if res.lower().startswith("changes") else "other")
            gates.append({"id": g.get("id"), "task": g.get("task_id"), "question": (g.get("question") or "")[:120],
                          "answer": res[:80], "kind": kind, "resolved": ts_of(g.get("resolved_at"))})
        out_runs.append({"id": rid, "objective": (run.get("objective") or "")[:160],
                         "created": ts_of(run.get("created_at")), "tasks": rtasks, "gates": gates})
    dispatches = []
    for did, info in known.items():
        t = tasks.get(info.get("task"))
        if t:
            t.update(agent=info["agent"], model=info["model"], effort=info["effort"])
            if info.get("from"):  # task bar in the Gantt: first dispatch to last completion
                t["started"] = min(t.get("started") or info["from"], info["from"])
            if info.get("to"):
                t["ended"] = max(t.get("ended") or info["to"], info["to"])
            t["repo"], t["worktree"] = repo_of(info["wt"]) if info["wt"] else (None, None)
        dispatches.append(info)
    for r in out_runs:
        repos = [t["repo"] for t in r["tasks"] if t["repo"]]
        r["repo"] = max(set(repos), key=repos.count) if repos else (r["objective"].split() or ["?"])[0]
    with cache.lock:
        if known != cache.cache["dispatch"]:
            cache.cache["dispatch"] = known
            cache.cache_dirty = True
        orca_state.update(available=True, runs=out_runs, tasks=tasks, dispatches=dispatches,
                          fetched_at=time.time(), error=None)

def orca_loop():
    while True:
        try:
            refresh_orca()
        except Exception as e:  # keep the dashboard alive without Orca
            orca_state.update(available=False, error=type(e).__name__, fetched_at=time.time())
        time.sleep(ORCA_TTL)
