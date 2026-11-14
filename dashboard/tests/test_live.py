import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from backend import live

NOW = 1794674000.0


def iso(offset):
    return datetime.fromtimestamp(NOW + offset, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def worker(did, task, state="succeeded", terminal="released", liveness="exited"):
    return dict(dispatchId=did, taskId=task, state=state, liveness=liveness, terminalState=terminal,
                workspace="ws::/Users/x/orca/workspaces/bisou/feat-a")


class Fake:
    """Mocked `orca orchestration` outputs keyed by Run."""

    def __init__(self):
        self.runs, self.tasks, self.workers, self.gates, self.messages = [], {}, {}, {}, []
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        cmd = args[0]
        rid = args[args.index("--run") + 1] if "--run" in args else None
        if cmd == "run-list":
            return {"runs": self.runs}
        if cmd == "task-list":
            return {"tasks": self.tasks.get(rid, [])}
        if cmd == "worker-list":
            return {"workers": self.workers.get(rid, [])}
        if cmd == "gate-list":
            return {"gates": self.gates.get(rid, [])}
        if cmd == "inbox":
            return {"messages": self.messages}
        if cmd == "worker-show":
            return {"dispatch": {"dispatchedAt": iso(-300), "completedAt": iso(-100)},
                    "worker": {"startOptions": {"launch": {"effective": {"agent": "codex"}}}}}
        raise AssertionError(cmd)


def run(rid, updated_offset=-60, **kw):
    return dict(id=rid, objective="builder: " + rid, legacy=0, created_at=iso(updated_offset - 600), updated_at=iso(updated_offset), **kw)


def task(tid, status, created=-500, completed=None, title="builder: thing"):
    t = dict(id=tid, task_title=title, status=status, created_at=iso(created).replace("T", " ").replace("Z", ""))
    if completed is not None:
        t["completed_at"] = iso(completed)
    return t


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state_file = os.path.join(self.tmp.name, "live-state.json")
        self.fake = Fake()
        for p in (patch.object(live, "_orca", self.fake), patch.object(live, "LIVE_STATE_FILE", self.state_file),
                  patch.object(live, "_sessions", return_value=[]),
                  patch.object(live.cache, "cache", {"dispatch": {}, "files": {}}),
                  patch.object(live, "_state", None), patch.object(live, "_disp", {}),
                  patch.object(live, "_inactive", {}), patch.object(live, "_state_dirty", False)):
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def ids(self, now=NOW):
        return [r["id"] for r in live.compute(now)["runs"]]

    def test_active_run_filtering(self):
        f = self.fake
        f.runs = [run("run_open"), run("run_gate"), run("run_done"), run("run_kept"), run("run_old", updated_offset=-4 * 86400),
                  run("run_stale", updated_offset=-20 * 3600), dict(run("run_legacy"), legacy=1)]
        f.tasks = {"run_open": [task("t1", "in_progress")],
                   "run_gate": [task("t2", "completed", completed=-100)],
                   "run_done": [task("t3", "completed", completed=-100), task("t4", "failed", completed=-90)],
                   "run_kept": [task("t5", "completed", completed=-100)],
                   "run_old": [task("t6", "in_progress")],
                   "run_stale": [task("t7", "blocked", created=-20 * 3600)]}
        f.gates = {"run_gate": [dict(id="g1", task_id="t2", question="ok?", status="pending", created_at=iso(-50))]}
        f.workers = {"run_done": [worker("d3", "t3"), worker("d4", "t4", state="failed")],
                     "run_kept": [worker("d5", "t5", terminal="retained")]}
        self.assertEqual(sorted(self.ids()), ["run_gate", "run_kept", "run_open"])
        asked = {a[a.index("--run") + 1] for a in f.calls if "--run" in a}
        self.assertNotIn("run_old", asked)      # outside the window: never fetched
        self.assertNotIn("run_legacy", asked)
        # a running worker keeps a Run live even when its open tasks look abandoned
        f.workers["run_stale"] = [worker("d7", "t7", state="running", terminal="active", liveness="alive")]
        live._inactive.clear()
        self.assertIn("run_stale", self.ids())

    def test_inactive_runs_are_not_refetched_for_a_while(self):
        f = self.fake
        f.runs = [run("run_done")]
        f.tasks = {"run_done": [task("t3", "completed", completed=-100)]}
        f.workers = {"run_done": [worker("d3", "t3")]}
        self.ids()
        before = len(f.calls)
        self.ids(NOW + 5)
        self.assertEqual([a[0] for a in f.calls[before:]].count("task-list"), 0)
        self.ids(NOW + live.RECHECK + 1)
        self.assertGreater([a[0] for a in f.calls].count("task-list"), 1)

    def test_released_at_is_first_seen_and_survives_restart(self):
        f = self.fake
        f.runs = [run("run_a")]
        f.tasks = {"run_a": [task("t1", "completed", completed=-30), task("t2", "in_progress")]}
        f.workers = {"run_a": [worker("d1", "t1", terminal="retained"), worker("d2", "t2", state="running", terminal="active")]}
        r = live.compute(NOW)["runs"][0]
        self.assertNotIn("released_at", r["workers"][0])
        self.assertEqual(r["workers"][0]["status"], "idle")
        self.assertEqual(r["workers"][1]["status"], "working")
        f.workers["run_a"][0]["terminalState"] = "released"
        r = live.compute(NOW + 10)["runs"][0]
        self.assertEqual(r["workers"][0]["released_at"], NOW + 10)
        self.assertEqual(r["workers"][0]["status"], "released")
        live._state = None  # restart: reload from the JSON file
        r = live.compute(NOW + 500)["runs"][0]
        self.assertEqual(r["workers"][0]["released_at"], NOW + 10)
        with open(self.state_file) as fh:
            self.assertEqual(json.load(fh)["workers"]["d1"]["released_at"], NOW + 10)

    def test_first_sight_already_released_uses_dispatch_end(self):
        f = self.fake
        f.runs = [run("run_a")]
        f.tasks = {"run_a": [task("t1", "completed", completed=-100), task("t2", "ready")]}
        f.workers = {"run_a": [worker("d1", "t1")]}
        r = live.compute(NOW)["runs"][0]
        self.assertEqual(r["workers"][0]["released_at"], NOW - 100)  # worker-show completedAt, not "now"

    def test_events(self):
        f = self.fake
        f.runs = [run("run_a")]
        f.tasks = {"run_a": [task("t1", "completed", created=-400, completed=-200, title="builder: build the thing"),
                             task("t2", "ready", created=-100, title="reviewer: check it")]}
        f.workers = {"run_a": [worker("d1", "t1", terminal="retained")]}
        f.gates = {"run_a": [dict(id="g1", task_id="t2", question="Gate 1: approve spec?", status="resolved",
                                  resolution="approve", created_at=iso(-90), resolved_at=iso(-80))]}
        f.messages = [
            dict(id="m1", run_id="run_a", type="worker_done", created_at=iso(-200), subject="done",
                 payload=json.dumps(dict(taskId="t1", dispatchId="d1", outcome="succeeded"))),
            dict(id="m2", run_id="run_a", type="question", created_at=iso(-250), subject="which anchor day?",
                 payload=json.dumps(dict(taskId="t1"))),
            dict(id="m3", run_id="other", type="worker_done", created_at=iso(-10), payload="{}")]
        live.compute(NOW)
        f.workers["run_a"][0]["terminalState"] = "released"
        run_out = live.compute(NOW + 20)["runs"][0]
        text = {e["type"]: e["text"] for e in run_out["events"]}
        self.assertEqual(sorted(text), ["ask", "dispatch", "done", "gate", "gate_ok", "release", "split"])
        self.assertEqual(text["dispatch"], "Orchestrator giao 'builder: build the thing' cho Codex")
        self.assertEqual(text["done"], "Codex báo cáo xong 'builder: build the thing'")
        self.assertEqual(text["ask"], "Codex hỏi Orchestrator: which anchor day?")
        self.assertEqual(text["gate"], "Cổng PO mở: Gate 1: approve spec?")
        self.assertEqual(text["gate_ok"], "PO duyệt cổng")
        self.assertEqual(text["release"], "Orchestrator cho Codex nghỉ sau 'builder: build the thing'")
        times = [e["t"] for e in run_out["events"]]
        self.assertEqual(times, sorted(times))
        self.assertEqual(len({e["id"] for e in run_out["events"]}), len(run_out["events"]))
        for e in run_out["events"]:
            self.assertNotRegex(e["text"], "[\u2013\u2014]")

    def test_orchestrator_agent_comes_from_the_dispatcher_session(self):
        sessions = [dict(agent="codex", dispatcher=False, runs=[["run_a", 5]]),
                    dict(agent="claude", dispatcher=True, runs=[["run_a", 10]], start=1),
                    dict(agent="hermes", dispatcher=True, runs=[["run_a", 50]], start=1)]
        self.assertEqual(live.orchestrators(sessions), {"run_a": "hermes"})
        self.assertEqual(live.orchestrators(sessions[:2]), {"run_a": "claude"})
        f = self.fake
        f.runs = [run("run_a"), run("run_b")]
        f.tasks = {"run_a": [task("t1", "in_progress")], "run_b": [task("t2", "in_progress")]}
        with patch.object(live, "_sessions", return_value=sessions[:2]):
            out = {r["id"]: r for r in live.compute(NOW)["runs"]}
        self.assertEqual(out["run_a"]["orchestrator"]["agent"], "claude")
        self.assertNotIn("orchestrator", out["run_b"])  # unknown: omitted, not a placeholder

    def test_get_serves_the_previous_snapshot_while_recomputing(self):
        import threading
        gate, calls = threading.Event(), []

        def slow(now):
            calls.append(now)
            if len(calls) > 1:
                gate.wait(2)
            return {"generated_at": now, "available": True, "runs": [], "n": len(calls)}

        with patch.object(live, "compute", slow), patch.object(live, "_snap", {"at": 0.0, "data": None, "busy": False}), \
                patch.object(live, "LIVE_TTL", 0):
            self.assertEqual(live.get()["n"], 1)          # first call computes
            self.assertEqual(live.get()["n"], 1)          # stale: answered at once from the old snapshot
            self.assertEqual(len(calls), 2)               # while one recompute runs
            self.assertEqual(live.get()["n"], 1)          # and only one at a time
            self.assertEqual(len(calls), 2)
            gate.set()
            for _ in range(50):
                if live._snap["data"]["n"] == 2:
                    break
                threading.Event().wait(0.02)
            self.assertEqual(live._snap["data"]["n"], 2)

    def test_orca_unavailable(self):
        with patch.object(live, "_orca", return_value=None):
            out = live.compute(NOW)
        self.assertFalse(out["available"])
        self.assertEqual(out["runs"], [])

    def test_fixture_is_valid_at_any_phase(self):
        from backend import live_fixture
        seen = set()
        for sec in range(0, live_fixture.LOOP, 3):
            snap = live_fixture.build(1794600000 + sec)
            json.dumps(snap)
            for r in snap["runs"]:
                seen.update(w["status"] for w in r["workers"])
        self.assertEqual(seen, {"working", "idle", "released"})


if __name__ == "__main__":
    unittest.main()
