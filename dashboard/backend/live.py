"""Live view of the Orchestrators coordinating the team right now (GET /api/live).

Computed on request from short `orca orchestration` calls and cached for LIVE_TTL seconds, so the
60 s Orca refresh thread in orca.py is not involved. Orca has no release or transition timestamps:
the first time this module sees a worker released, or a task change status, it stores that moment in
.cache/live-state.json so released_at and the event log survive restarts.
"""

import json
import os
import shutil
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import cache
from .config import LIVE_STALE, LIVE_STATE_FILE, LIVE_TTL, LIVE_WINDOW
from .parsers.common import repo_of, ts_of
from .roles import known_roles, role_from_title

DONE_TASK = ("completed", "failed", "cancelled", "canceled")
DONE_WORKER = ("succeeded", "failed", "stopped", "abandoned", "cancelled", "canceled")
MAX_EVENTS = 40
RECHECK = 30  # seconds before a run found inactive is looked at again, unless its updated_at moved

ORCA_BIN = shutil.which("orca") or "orca"
lock = threading.Lock()
_snap = {"at": 0.0, "data": None, "busy": False}
_state = None          # persisted: tasks / workers / gates first-seen records
_state_dirty = False
_disp = {}             # dispatchId -> {agent, from, to}, memo of worker-show
_inactive = {}         # run id -> (updated_at, checked_at)
_hint = {"tasks": {}, "runs": {}}  # token totals from the last /api/data build


def _orca(*args):
    try:
        # absolute path + close_fds=False lets Python 3.9 use posix_spawn: fork of this large process costs ~0.4 s per call
        r = subprocess.run([ORCA_BIN, "orchestration", *args, "--json"], capture_output=True, text=True, timeout=8, close_fds=False)
        if r.returncode != 0:
            return None
        return json.loads(r.stdout).get("result")
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def note_build(data):
    """Remember token totals per task and per Run from a finished usage.build()."""
    tasks, runs = {}, {}
    for r in (data.get("orca") or {}).get("runs") or []:
        runs[r["id"]] = {"tokens": sum(v for k, v in (r.get("tokens") or {}).items() if k != "sessions"),
                         "orchestrator": r.get("orchestrator_by_agent") or {}}
        for t in r.get("tasks") or []:
            total = sum((t.get("tokens") or {}).values())
            if total:
                tasks[t["id"]] = total
    _hint["tasks"], _hint["runs"] = tasks, runs


# ---------------------------------------------------------------- persisted state
def _load_state():
    global _state
    if _state is None:
        try:
            with open(LIVE_STATE_FILE) as f:
                _state = json.load(f)
        except (OSError, ValueError):
            _state = {}
        for k in ("tasks", "workers", "gates"):
            _state.setdefault(k, {})
    return _state


def _save_state(now):
    global _state_dirty
    if not _state_dirty:
        return
    for k, keep in (("tasks", 14), ("workers", 14), ("gates", 14)):
        for key in [x for x, v in _state[k].items() if now - v.get("seen", now) > keep * 86400]:
            del _state[k][key]
    try:
        os.makedirs(os.path.dirname(LIVE_STATE_FILE), exist_ok=True)
        tmp = LIVE_STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_state, f, separators=(",", ":"))
        os.replace(tmp, LIVE_STATE_FILE)
        _state_dirty = False
    except OSError:
        pass


def _touch(table, key, now, **fields):
    """Record a first sighting, or update `seen`. Returns (record, created)."""
    global _state_dirty
    rec = _state[table].get(key)
    created = rec is None
    if created:
        rec = _state[table][key] = {}
    if created or now - rec.get("seen", 0) > 3600:  # `seen` only prunes old records: skip the 3 s rewrites
        rec["seen"] = now
        _state_dirty = True
    for k, v in fields.items():
        if rec.get(k) != v:
            rec[k] = v
            _state_dirty = True
    return rec, created


# ---------------------------------------------------------------- helpers
def _short(text, n=42):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[:n - 1] + "…"


def _agent_name(a):
    return {"claude": "Claude", "codex": "Codex", "copilot": "Copilot", "cursor": "Cursor", "hermes": "Hermes"}.get(a) or "Worker"


def _json(s):
    try:
        v = json.loads(s) if isinstance(s, str) else s
        return v if isinstance(v, dict) else {}
    except ValueError:
        return {}


def worker_state(w):
    """working while Orca still runs the Dispatch, idle after it settled but the terminal is kept, released."""
    if w.get("terminalState") == "released":
        return "released"
    if w.get("state") in DONE_WORKER:
        return "idle"
    return "working"


def _dispatch_info(did, now):
    info = cache.cache["dispatch"].get(did) or _disp.get(did)
    if info and info.get("agent"):
        return info
    res = _orca("worker-show", "--dispatch", did)
    if not res:
        return info or {}
    disp, wk = res.get("dispatch") or {}, res.get("worker") or {}
    eff = ((wk.get("startOptions") or {}).get("launch") or {}).get("effective") or {}
    info = {"agent": eff.get("agent"), "from": ts_of(disp.get("dispatchedAt")), "to": ts_of(disp.get("completedAt"))}
    _disp[did] = info
    return info


def orchestrators(sessions):
    """Run id -> agent of the most recent dispatcher session bound to it."""
    best = {}
    for s in sessions:
        if not s.get("dispatcher"):
            continue
        for rid, ts in s.get("runs") or []:
            at = ts or s.get("start") or 0
            if rid not in best or at >= best[rid][0]:
                best[rid] = (at, s.get("agent"))
    return {rid: v[1] for rid, v in best.items() if v[1]}


def _sessions():
    out = [ent["v"] for ent in list(cache.cache["files"].values())]
    try:
        from .parsers import hermes
        out += hermes.parse_hermes(0)
    except Exception:  # Hermes DB missing or locked: the Orchestrator agent is just omitted
        pass
    return out


# ---------------------------------------------------------------- build
def _fetch_run(run):
    rid = run["id"]
    tl = _orca("task-list", "--run", rid, "--full")
    wl = _orca("worker-list", "--run", rid, "--limit", "100")
    gl = _orca("gate-list", "--run", rid, "--full")
    return run, tl, wl, gl


def is_active(tasks, workers, gates, last_activity=None, now=None):
    """A Run is live while work is open, a gate waits or a worker terminal is held. Open work that has
    seen no activity for LIVE_STALE (an abandoned blocked task) does not keep a Run live, a running worker does."""
    if any(w["status"] == "working" for w in workers):
        return True
    if last_activity is not None and now - last_activity > LIVE_STALE:
        return False
    return (any(t["status"] not in DONE_TASK for t in tasks)
            or any(g["status"] != "resolved" for g in gates)
            or any(w["status"] == "working" or (w["status"] == "idle" and w.get("terminal_state") is not None)
                   for w in workers))


def quick_active(run, tl, wl, gl, msgs, now):
    """Liveness from the raw lists alone, so worker-show lookups are spent only on Runs that are live."""
    tasks = [{"status": t.get("status") or ""} for t in tl.get("tasks") or []]
    workers = [{"status": worker_state(w), "terminal_state": w.get("terminalState")} for w in wl.get("workers") or []]
    gates = [{"status": g.get("status") or ""} for g in gl.get("gates") or []]
    stamps = [ts_of(run.get("updated_at")), ts_of(run.get("created_at"))]
    stamps += [ts_of(t.get("created_at")) for t in tl.get("tasks") or []] + [ts_of(t.get("completed_at")) for t in tl.get("tasks") or []]
    stamps += [ts_of(g.get("created_at")) for g in gl.get("gates") or []] + [ts_of(g.get("resolved_at")) for g in gl.get("gates") or []]
    stamps += [ts_of(m.get("created_at")) for m in msgs]
    return is_active(tasks, workers, gates, max([x for x in stamps if x] or [0]), now)


def build_run(run, tl, wl, gl, now, orch_agent, msgs):
    rid = run["id"]
    _load_state()
    roles = known_roles()
    raw_workers = (wl or {}).get("workers") or []
    by_task_agent, by_task_disp, repos = {}, {}, []
    workers = []
    for w in raw_workers:
        did = w.get("dispatchId")
        info = _dispatch_info(did, now) if did else {}
        rec, first = _touch("workers", did, now, run=rid) if did else ({}, False)
        st = worker_state(w)
        if did:
            if st == "released" and not rec.get("released_at"):
                # first sighting already released: use the Dispatch end as a lower bound, else now
                _touch("workers", did, now, released_at=(info.get("to") if first and info.get("to") else now))
            elif st != "released" and rec.get("released_at"):
                _touch("workers", did, now, released_at=None)
        ws = {"dispatch_id": did, "task_id": w.get("taskId"), "state": w.get("state"), "liveness": w.get("liveness"),
              "terminal_state": w.get("terminalState"), "status": st}
        if info.get("agent"):
            ws["agent"] = info["agent"]
        if info.get("from"):
            ws["dispatched_at"] = info["from"]
        if st == "released" and did and rec.get("released_at"):
            ws["released_at"] = _state["workers"][did]["released_at"]
        ws_path = (w.get("workspace") or "").split("::", 1)[-1]
        if ws_path:
            repos.append(repo_of(ws_path)[0])
        workers.append(ws)
        if w.get("taskId"):
            by_task_agent.setdefault(w["taskId"], info.get("agent"))
            by_task_disp.setdefault(w["taskId"], info)

    tasks = []
    for t in (tl or {}).get("tasks") or []:
        tid, title = t["id"], (t.get("task_title") or t.get("title") or "")
        status = t.get("status") or ""
        rec, _ = _touch("tasks", tid, now, run=rid)
        if rec.get("last") != status:
            _touch("tasks", tid, now, last=status, status_since=now)
        since = _state["tasks"][tid]["status_since"]
        info = by_task_disp.get(tid) or {}
        task = {"id": tid, "title": title[:120], "status": status, "created": ts_of(t.get("created_at"))}
        role = role_from_title(title, roles)
        if role:
            task["role"] = role
        if by_task_agent.get(tid):
            task["agent"] = by_task_agent[tid]
        if info.get("from"):
            task["started"] = info["from"]
        end = ts_of(t.get("completed_at"))
        if end is None and status in DONE_TASK:
            end = since
        if end:
            task["ended"] = end
        if _hint["tasks"].get(tid):
            task["tokens"] = _hint["tasks"][tid]
        tasks.append(task)

    gates = []
    for g in (gl or {}).get("gates") or []:
        gid = g["id"]
        gate = {"id": gid, "task_id": g.get("task_id"), "question": (g.get("question") or "")[:160],
                "status": g.get("status") or "", "created": ts_of(g.get("created_at"))}
        if g.get("status") == "resolved":
            gate["resolved"] = ts_of(g.get("resolved_at"))
            gate["resolution"] = (g.get("resolution") or "")[:80]
        _touch("gates", gid, now, status=gate["status"], run=rid)
        gates.append(gate)

    title_of = {t["id"]: t["title"] for t in tasks}
    agent_of = {t["id"]: t.get("agent") for t in tasks}
    events = []

    def ev(t, typ, text, task=None, agent=None, key=None):
        if t:
            events.append({"id": "%s:%s:%d" % (typ, key or task or rid, t), "t": t, "type": typ, "run": rid,
                           "task": task, "agent": agent, "text": text})

    for t in tasks:
        ttl = "'%s'" % _short(t["title"])
        ev(t.get("created"), "split", "Orchestrator tách việc %s" % ttl, t["id"])
        if t.get("started") or by_task_agent.get(t["id"]):
            ag = t.get("agent")
            ev(t.get("started") or _state["tasks"][t["id"]]["status_since"], "dispatch",
               "Orchestrator giao %s cho %s" % (ttl, _agent_name(ag)), t["id"], ag)
    for w in workers:
        if w["status"] == "released" and w.get("released_at"):
            ag, tid = w.get("agent"), w.get("task_id")
            ev(w["released_at"], "release", "Orchestrator cho %s nghỉ sau '%s'" % (_agent_name(ag), _short(title_of.get(tid))),
               tid, ag, key=w["dispatch_id"])
    for g in gates:
        ev(g.get("created"), "gate", "Cổng PO mở: %s" % _short(g["question"], 80), g.get("task_id"), key=g["id"])
        if g.get("resolved"):
            res = g.get("resolution") or ""
            text = "PO duyệt cổng" if res.lower().startswith("approve") else "PO trả lời cổng: %s" % _short(res, 60)
            ev(g["resolved"], "gate_ok", text, g.get("task_id"), key=g["id"])
    for m in msgs:
        p = _json(m.get("payload"))
        tid = p.get("taskId")
        at, ag = ts_of(m.get("created_at")), agent_of.get(tid)
        if m.get("type") == "worker_done":
            ok = p.get("outcome") in (None, "succeeded")
            ev(at, "done", "%s báo cáo %s '%s'" % (_agent_name(ag), "xong" if ok else "không xong", _short(title_of.get(tid))),
               tid, ag, key=m["id"])
        elif m.get("type") in ("question", "escalation"):
            ev(at, "ask", "%s hỏi Orchestrator: %s" % (_agent_name(ag), _short(m.get("subject"), 80)), tid, ag, key=m["id"])
    events.sort(key=lambda e: (e["t"], e["id"]))

    hint = _hint["runs"].get(rid) or {}
    out = {"id": rid, "objective": (run.get("objective") or "")[:160], "created": ts_of(run.get("created_at")),
           "updated": ts_of(run.get("updated_at")), "tasks": tasks, "workers": workers, "gates": gates,
           "events": events[-MAX_EVENTS:]}
    if repos:
        out["repo"] = max(set(repos), key=repos.count)
    if orch_agent:
        out["orchestrator"] = {"agent": orch_agent}
    if hint.get("tokens"):
        out["tokens"] = hint["tokens"]
        if hint.get("orchestrator") and out.get("orchestrator"):
            out["orchestrator"]["tokens"] = sum(hint["orchestrator"].values())
    return out


def compute(now=None):
    now = now or time.time()
    st = _load_state()
    res = _orca("run-list", "--limit", "100", "--full")
    if res is None:
        return {"generated_at": now, "available": False, "error": "orca không chạy được", "runs": []}
    cands = []
    for r in res.get("runs") or []:
        if r.get("legacy"):
            continue
        upd = ts_of(r.get("updated_at")) or ts_of(r.get("created_at")) or 0
        if now - upd > LIVE_WINDOW:
            continue
        seen = _inactive.get(r["id"])
        if seen and seen[0] == upd and now - seen[1] < RECHECK:
            continue
        cands.append(r)
    with ThreadPoolExecutor(6) as ex:
        inbox_job = ex.submit(_orca, "inbox", "--limit", "200", "--full")
        fetched = list(ex.map(_fetch_run, cands))
        inbox = inbox_job.result() or {}
    by_run = {}
    for m in inbox.get("messages") or []:
        by_run.setdefault(m.get("run_id"), []).append(m)
    orch = orchestrators(_sessions())
    runs, errors = [], []
    for run, tl, wl, gl in fetched:
        if tl is None or wl is None or gl is None:
            errors.append(run["id"])
            continue
        msgs = by_run.get(run["id"], [])
        if quick_active(run, tl, wl, gl, msgs, now):
            _inactive.pop(run["id"], None)
            runs.append(build_run(run, tl, wl, gl, now, orch.get(run["id"]), msgs))
        else:
            _inactive[run["id"]] = (ts_of(run.get("updated_at")) or ts_of(run.get("created_at")) or 0, now)
    runs.sort(key=lambda r: r.get("created") or 0)
    _save_state(now)
    out = {"generated_at": now, "available": True, "runs": runs}
    if errors:
        out["error"] = "Thiếu dữ liệu Orca: " + ", ".join(errors)
    return out


def _refresh():
    now = time.time()
    try:
        data = compute(now)
        data["compute_ms"] = int((time.time() - now) * 1000)
    except Exception as e:  # keep the endpoint alive; the page shows the error
        data = {"generated_at": now, "available": False, "error": type(e).__name__, "runs": []}
    with lock:
        _snap.update(data=data, at=time.time(), busy=False)


def get(fixture=False):
    """Fresh snapshot within LIVE_TTL. Past that the previous one is returned at once while a background
    thread recomputes (orca calls cost 0.2 to 0.6 s each), so the endpoint stays fast under load."""
    if fixture:
        from . import live_fixture
        return live_fixture.build(time.time())
    with lock:
        if _snap["data"] is not None and time.time() - _snap["at"] < LIVE_TTL:
            return _snap["data"]
        if _snap["data"] is not None:
            if not _snap["busy"]:
                _snap["busy"] = True
                threading.Thread(target=_refresh, daemon=True).start()
            return _snap["data"]
        _snap["busy"] = True
    _refresh()  # first call: nothing to serve yet
    return _snap["data"]
