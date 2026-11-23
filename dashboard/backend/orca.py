import json
import os
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


def task_routing(task):
    records = []
    raw_records = re.findall(r"^Routing:\s*(.+)$", task.get("spec") or "", re.M)
    log = re.search(r"^Routing-log:\s*(.+)$", task.get("spec") or "", re.M)
    if log:
        path = log.group(1).strip()
        marker = os.sep + ".team" + os.sep
        if os.path.isabs(path) and marker in path and os.path.basename(path) == "routing.jsonl":
            team = os.path.realpath(path.split(marker, 1)[0] + os.sep + ".team")
            resolved = os.path.realpath(path)
            if os.path.commonpath((team, resolved)) == team:
                try:
                    with open(resolved, encoding="utf-8") as source:
                        for raw in source:
                            try:
                                entry = json.loads(raw)
                            except ValueError:
                                continue
                            if isinstance(entry, dict) and task.get("id") and entry.get("task") == task["id"]:
                                raw_records.append(raw)
                except (OSError, UnicodeError):
                    pass
    for raw in raw_records:
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(data, dict) or data.get("tier") not in ("fast", "work", "top"):
            continue
        if any(not isinstance(data.get(k), str) or not data[k].strip() for k in ("catalog", "agent")):
            continue
        if any(data.get(k) is not None and not isinstance(data[k], str) for k in ("model", "effort", "dispatch")):
            continue
        records.append({k: data.get(k) for k in ("tier", "catalog", "agent", "model", "effort", "dispatch")})
    return records


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

def run_events(rid, tasks, gates, workers, known, messages):
    titles = {t["id"]: t["title"] for t in tasks}
    dispatches = {w["dispatchId"]: w for w in workers if w.get("dispatchId")}

    def endpoint(handle, at):
        if handle == "run:" + rid:
            return "Orchestrator", False, None, "coordinator"
        worker = dispatches.get((handle or "").removeprefix("dispatch:"))
        if not worker:
            candidates = [w for did, w in dispatches.items() if w.get("agentTerminalHandle") == handle
                          and 0 < (known.get(did, {}).get("from") or 0) <= at]
            worker = max(candidates, key=lambda w: known[w["dispatchId"]]["from"], default=None)
        return (titles.get(worker.get("taskId"), worker["dispatchId"]), True, worker.get("taskId"), worker.get("agentTerminalHandle") or worker["dispatchId"]) if worker else (handle or "Không rõ", False, None, handle or "unknown")

    events = []
    for did, w in dispatches.items():
        at = known.get(did, {}).get("from")
        if at:
            events.append(dict(id="dispatch:" + did, at=at, kind="dispatch", **{
                "from": "Orchestrator", "to": titles.get(w.get("taskId"), did), "text": "Giao việc", "body": did,
                "from_actor": "coordinator", "to_actor": w.get("agentTerminalHandle") or did, "to_task": w.get("taskId")}))
    for g in gates:
        for at, kind, sender, target, text in (
                (g["created"], "gate_question", "Orchestrator", "PO", g["question"]),
                (g["resolved"], "gate_answer", "PO", "Orchestrator", g["answer"])):
            if at:
                events.append(dict(id=g["id"] + ":" + kind, at=at, kind=kind,
                                   **{"from": sender, "to": target, "from_actor": "coordinator" if sender == "Orchestrator" else "po",
                                      "to_actor": "po" if target == "PO" else "coordinator", "text": text, "body": g["question"] if kind == "gate_answer" else ""}))
    for m in messages:
        at = ts_of(m.get("created_at"))
        if not at:
            continue
        sender, sw, source_task, source_actor = endpoint(m.get("from_handle"), at)
        target, tw, target_task, target_actor = endpoint(m.get("to_handle"), at)
        events.append(dict(id=m.get("id"), at=at, kind="peer" if sw and tw else "message",
                           **{"from": sender, "to": target, "text": m.get("subject") or m.get("type") or "Tin nhắn",
                              "body": m.get("body") or "", "type": m.get("type"),
                              "from_task": source_task, "to_task": target_task, "from_actor": source_actor, "to_actor": target_actor}))
    return sorted(events, key=lambda e: (e["at"], e["id"] or ""))


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
                return rid, None, None, None, None
            workers.extend(page.get("workers") or [])
            cursor = (page.get("page") or {}).get("nextCursor")
            if not cursor:
                break
        return (rid, orca("task-list", "--run", rid), orca("gate-list", "--run", rid), {"workers": workers},
                orca("inbox", "--run", rid, "--limit", "500"))

    with ThreadPoolExecutor(6) as ex:
        details = list(ex.map(per_run, runs))
    known = dict(cache.cache["dispatch"])
    todo = []
    for _, _, _, wl, _ in details:
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
    for run, (rid, tl, gl, wl, inbox) in zip(runs, details):
        if any(v is None for v in (tl, gl, wl)):
            errors.append(rid)
            continue
        rtasks = []
        for t in (tl or {}).get("tasks") or []:
            title = t.get("task_title") or t.get("title") or ""
            measurement = task_measurement(t)
            role = role_from_title(title, roles)
            if not role and measurement["kind"] in ("qa", "delivery"):
                role = "builder"
            rec = {"id": t["id"], "run": rid, "title": title[:120], "role": role,
                   "status": t.get("status"), "created": ts_of(t.get("created_at")),
                   "completed": ts_of(t.get("completed_at")), "agent": None, "model": None, "effort": None,
                   "repo": None, "worktree": None, "measurement": measurement, "routing": task_routing(t)}
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
            gates.append({"id": g.get("id"), "task": g.get("task_id"), "question": (g.get("question") or ""),
                          "answer": res, "kind": kind, "stage": stage,
                          "created": ts_of(g.get("created_at")), "resolved": ts_of(g.get("resolved_at"))})
        out_runs.append({"id": rid, "objective": (run.get("objective") or "")[:160],
                         "created": ts_of(run.get("created_at")), "tasks": rtasks, "gates": gates,
                         "stage": run_stage(run, rtasks, gates),
                         "events": run_events(rid, rtasks, gates, wl["workers"], known, (inbox or {}).get("messages") or []),
                         "messages_available": inbox is not None,
                         "messages_limited": len((inbox or {}).get("messages") or []) >= 500})
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
        dispatches.append(dict(info, id=did))
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
        orca_state.update(available=True, loaded=True, runs=out_runs, tasks=tasks, dispatches=dispatches,
                          fetched_at=time.time(), error=("Thiếu dữ liệu Orca: " + ", ".join(errors)) if errors else None)

def orca_loop():
    while True:
        try:
            refresh_orca()
        except Exception as e:  # keep the dashboard alive without Orca
            orca_state.update(available=False, error=type(e).__name__, fetched_at=time.time())
        time.sleep(ORCA_TTL)
