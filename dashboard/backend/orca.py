import json
import re
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import cache
from .config import ORCA_TTL
from .parsers.common import repo_of, ts_of
from .roles import known_roles, role_from_title

orca_state = {"available": None, "runs": [], "tasks": {}, "dispatches": [], "fetched_at": None, "error": None}


def task_measurement(task):
    result = dict(kind="unknown", round=None, cause=None, source="unknown")
    match = re.search(r"^Measurement:\s*(.+)$", task.get("spec") or "", re.M)
    if match:
        try:
            data = json.loads(match.group(1))
            if not isinstance(data, dict):
                return result
            if data.get("kind") in ("build", "review", "fix", "re-review", "delivery", "close", "spec", "qa", "merge", "other"):
                result.update(kind=data["kind"], source="metadata")
            n = data.get("round")
            if type(n) is int and n > 0:
                result["round"] = n
            if data.get("cause") in ("defect", "requirements", "scope", "standards"):
                result["cause"] = data["cause"]
        except ValueError:
            pass
        return result
    title = (task.get("task_title") or task.get("title") or "").lower()
    if re.search(r"\bre-?review\b", title):
        kind = "re-review"
    elif re.search(r"\bfix\b", title):
        kind = "fix"
    else:
        head = title.split(":", 1)[0].strip()
        kind = {"builder": "build", "build": "build", "reviewer": "review", "review": "review",
                "verify": "review", "delivery": "delivery", "deliver": "delivery", "close": "close",
                "spec": "spec", "qa": "qa"}.get(head, "unknown")
    if kind != "unknown":
        result.update(kind=kind, source="title")
    return result


def run_stage(run, tasks, gates):
    if run.get("status") in ("merged", "cancelled", "canceled"):
        return "cancelled" if run["status"] == "canceled" else run["status"]
    if any(t["measurement"]["kind"] == "merge" and t["status"] == "completed" for t in tasks):
        return "merged"
    pending = [g for g in gates if g["kind"] == "pending"]
    if pending:
        return "awaiting_delivery" if any(g["stage"] == "delivery" for g in pending) else "awaiting_approval"
    if any(t["status"] == "failed" for t in tasks):
        return "failed"
    if any(t["status"] == "blocked" for t in tasks):
        return "blocked"
    if tasks and all(t["status"] in ("cancelled", "canceled") for t in tasks):
        return "cancelled"
    if any(t["status"] not in ("completed", "cancelled", "canceled") for t in tasks):
        return "in_progress"
    if any(g["stage"] == "delivery" and g["kind"] == "approve" for g in gates) and any(
            t["measurement"]["kind"] == "delivery" and t["status"] == "completed" for t in tasks):
        return "delivered"
    return "unknown"

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
        workers, cursor = [], None
        while True:
            page = orca("worker-list", "--run", rid, "--limit", "100", *(["--cursor", cursor] if cursor else []))
            if page is None:
                return rid, None, None, None
            workers.extend(page.get("workers") or [])
            cursor = (page.get("page") or {}).get("nextCursor")
            if not cursor:
                break
        return (rid, orca("task-list", "--run", rid), orca("gate-list", "--run", rid), {"workers": workers})

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
    errors = []
    for run, (rid, tl, gl, wl) in zip(runs, details):
        if any(v is None for v in (tl, gl, wl)):
            errors.append(rid)
            continue
        rtasks = []
        for t in (tl or {}).get("tasks") or []:
            title = t.get("task_title") or t.get("title") or ""
            rec = {"id": t["id"], "run": rid, "title": title[:120], "role": role_from_title(title, roles),
                   "status": t.get("status"), "created": ts_of(t.get("created_at")),
                   "completed": ts_of(t.get("completed_at")), "agent": None, "model": None, "effort": None,
                   "repo": None, "worktree": None, "measurement": task_measurement(t)}
            rtasks.append(rec)
            tasks[t["id"]] = rec
        gates = []
        for g in (gl or {}).get("gates") or []:
            res = (g.get("resolution") or "").strip()
            kind = ("pending" if g.get("status") != "resolved" else
                    "approve" if res.lower().startswith("approve") else
                    "changes" if res.lower().startswith("changes") else "other")
            task = tasks.get(g.get("task_id"))
            stage = "delivery" if task and task["measurement"]["kind"] == "close" else "other"
            gates.append({"id": g.get("id"), "task": g.get("task_id"), "question": (g.get("question") or "")[:120],
                          "answer": res[:80], "kind": kind, "stage": stage,
                          "created": ts_of(g.get("created_at")), "resolved": ts_of(g.get("resolved_at"))})
        out_runs.append({"id": rid, "objective": (run.get("objective") or "")[:160],
                         "created": ts_of(run.get("created_at")), "tasks": rtasks, "gates": gates,
                         "stage": run_stage(run, rtasks, gates)})
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
        delivery = [g["resolved"] for g in r["gates"] if g["stage"] == "delivery" and g["kind"] == "approve" and g["resolved"]]
        r["delivered_at"] = max(delivery) if delivery and r["stage"] in ("delivered", "merged") else None
        end = r["delivered_at"] or time.time()
        r["lead_seconds"] = max(0, end - r["created"]) if r["created"] else None
        intervals = sorted((g["created"], min(end, g["resolved"] or end)) for g in r["gates"] if g["created"] and g["created"] <= end)
        wait, last = 0, 0
        for a, b in intervals:
            wait += max(0, b - max(a, last))
            last = max(last, b)
        r["gate_wait_seconds"] = wait
        r["attention"] = [dict(kind="gate", text=g["question"], waiting_seconds=max(0, time.time() - g["created"]) if g["created"] else None)
                          for g in r["gates"] if g["kind"] == "pending"]
        r["attention"] += [dict(kind="task", text=t["title"], waiting_seconds=None)
                           for t in r["tasks"] if t["status"] in ("blocked", "failed")]
    with cache.lock:
        if known != cache.cache["dispatch"]:
            cache.cache["dispatch"] = known
            cache.cache_dirty = True
        orca_state.update(available=True, runs=out_runs, tasks=tasks, dispatches=dispatches,
                          fetched_at=time.time(), error=("Thiếu dữ liệu Orca: " + ", ".join(errors)) if errors else None)

def orca_loop():
    while True:
        try:
            refresh_orca()
        except Exception as e:  # keep the dashboard alive without Orca
            orca_state.update(available=False, error=type(e).__name__, fetched_at=time.time())
        time.sleep(ORCA_TTL)
