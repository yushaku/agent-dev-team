"""Scripted /api/live payload for GET /api/live?fixture=1 (and the page's ?live-fixture=1).

Two Runs replay a 150 s loop: tasks are split, dispatched, reported, released; one worker asks a
question; a PO gate opens and closes. It exists to check the tab visually when no Run is active.
"""

LOOP = 150
# (task id, title, role, agent, created, dispatch, end, release or None, tokens)
RUNS = [
    ("run_fixture_bisou", "bisou", "tech-lead: shared journal editing", "claude", [
        ("t_a1", "tech-lead: shared journal editing", "tech-lead", "codex", 0, 5, 30, 40, 1830000),
        ("t_a2", "builder: allow both partners to update journal", "builder", "codex", 32, 38, 70, 80, 3230000),
        ("t_a3", "reviewer: journal standards and security", "reviewer", "claude", 72, 76, 100, 110, 2070000),
        ("t_a4", "qa: journal verification", "qa", "hermes", 100, 104, 130, None, 880000),
        ("t_a5", "close: PO acceptance of journal editing", None, None, 132, None, None, None, 0),
    ], {"id": "gate_a", "task": "t_a5", "question": "Chờ PO nghiệm thu chỉnh sửa nhật ký chung", "open": 135, "resolved": 146}),
    ("run_fixture_monmon", "monmon", "tech-lead: recurring rules editor", "codex", [
        ("t_m1", "builder: rule editor sheet and validation", "builder", "cursor", 10, 20, 90, 100, 2480000),
        ("t_m2", "reviewer: recurring rules money safety", "reviewer", "copilot", 40, 95, 140, None, 640000),
    ], None),
]
ASK = ("t_m1", 60, "lịch lặp theo ngày neo hay ngày cố định")


def _name(a):
    return {"claude": "Claude", "codex": "Codex", "copilot": "Copilot", "cursor": "Cursor", "hermes": "Hermes"}[a]


def build(now):
    phase = now % LOOP
    base = now - phase
    runs = []
    for rid, repo, objective, orch, tasks, gate in RUNS:
        tl, wl, gl, ev = [], [], [], []

        def add(t, typ, text, task=None, agent=None, key=None):
            if t <= phase:
                ev.append({"id": "%s:%s:%d" % (typ, key or task, base + t), "t": base + t, "type": typ, "run": rid,
                           "task": task, "agent": agent, "text": text})

        for tid, title, role, agent, created, disp, end, rel, tok in tasks:
            if created > phase:
                continue
            status = "completed" if end is not None and end <= phase else "dispatched" if disp is not None and disp <= phase else "ready"
            if tid == "t_a5" and gate and gate["resolved"] <= phase:
                status = "completed"
            t = {"id": tid, "title": title, "status": status, "created": base + created}
            if role:
                t["role"] = role
            if agent and disp is not None and disp <= phase:
                t["agent"], t["started"] = agent, base + disp
                t["tokens"] = int(tok * min(1.0, (phase - disp) / max(1, end - disp)))
            if status == "completed" and end is not None:
                t["ended"] = base + end
            tl.append(t)
            add(created, "split", "Orchestrator tách việc '%s'" % title, tid)
            if agent and disp is not None and disp <= phase:
                add(disp, "dispatch", "Orchestrator giao '%s' cho %s" % (title, _name(agent)), tid, agent)
                state = "succeeded" if end <= phase else "running"
                released = rel is not None and rel <= phase
                wl.append({"dispatch_id": "ctx_" + tid, "task_id": tid, "state": state, "liveness": "exited" if end <= phase else "alive",
                           "terminal_state": "released" if released else "retained" if end <= phase else "active",
                           "status": "released" if released else "idle" if end <= phase else "working", "agent": agent,
                           "dispatched_at": base + disp, **({"released_at": base + rel} if released else {})})
                add(end, "done", "%s báo cáo xong '%s'" % (_name(agent), title), tid, agent, key="done_" + tid)
                if rel is not None:
                    add(rel, "release", "Orchestrator cho %s nghỉ sau '%s'" % (_name(agent), title), tid, agent, key="rel_" + tid)
        if rid == "run_fixture_monmon":
            add(ASK[1], "ask", "Cursor hỏi Orchestrator: %s" % ASK[2], ASK[0], "cursor", key="ask")
        if gate and gate["open"] <= phase:
            g = {"id": gate["id"], "task_id": gate["task"], "question": gate["question"], "created": base + gate["open"],
                 "status": "resolved" if gate["resolved"] <= phase else "pending"}
            add(gate["open"], "gate", "Cổng PO mở: " + gate["question"], gate["task"], key=gate["id"])
            if gate["resolved"] <= phase:
                g["resolved"], g["resolution"] = base + gate["resolved"], "approve"
                add(gate["resolved"], "gate_ok", "PO duyệt cổng", gate["task"], key=gate["id"] + "ok")
            gl.append(g)
        if not tl:
            continue
        ev.sort(key=lambda e: e["t"])
        runs.append({"id": rid, "repo": repo, "objective": objective, "created": base, "updated": now,
                     "orchestrator": {"agent": orch}, "tasks": tl, "workers": wl, "gates": gl, "events": ev[-40:],
                     "tokens": sum(t.get("tokens", 0) for t in tl)})
    return {"generated_at": now, "available": True, "fixture": True, "runs": runs}
