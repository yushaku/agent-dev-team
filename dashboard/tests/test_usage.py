import copy
import time
import unittest
from unittest.mock import patch

from backend import usage
from backend.parsers.common import finish_first, note_orca


def session(calls, **extra):
    return dict(agent="codex", id="session", cwd="/repo/worktree", start=calls[0][0],
                end=calls[-1][0], calls=calls, tasks=[], runs=[], dispatcher=False,
                role_line=None, skills=[], hooks={}, preview="", **extra)


def call(ts, tokens=10):
    return [ts, "test-model", "medium", tokens, 0, 0, 0, 0, None]


class UsageTests(unittest.TestCase):
    def build(self, sessions, tasks=None, runs=None, dispatches=None):
        state = dict(tasks=tasks or {}, runs=runs or [], dispatches=dispatches or [],
                     available=True, error=None, fetched_at=time.time())
        with patch.object(usage.cache, "load_files", return_value=copy.deepcopy(sessions)), \
             patch.object(usage.hermes, "parse_hermes", return_value=[]), \
             patch.object(usage.orca_mod, "orca_state", state), \
             patch.object(usage, "parse_rtk", return_value={"available": False}):
            return usage.build(7)

    def test_tiers_follow_current_registry(self):
        tiers = usage.read_tiers()["tiers"]
        self.assertEqual(tiers["top"]["claude"], "opus")
        self.assertEqual(tiers["top"]["effort"], "high")

    def test_reused_session_splits_tasks_and_preserves_unassigned_tokens(self):
        now = time.time() - 100
        tasks = {k: dict(id=k, run=r, role="builder", title=k) for k, r in
                 (("a", "run_a"), ("b", "run_b"))}
        s = session([call(now), call(now + 10, 20), call(now + 20, 30), call(now + 30, 40)])
        s["tasks"] = [["a", now + 10], ["b", now + 20], ["a", now + 30]]
        s["skills"] = [["tdd", now + 10], ["ponytail", now + 20]]
        data = self.build([s], tasks, [dict(id=r, tasks=[], gates=[]) for r in ("run_a", "run_b")])
        self.assertEqual(data["attribution"]["assigned"], 90)
        self.assertEqual(data["attribution"]["unassigned"], 10)
        self.assertEqual(sum(s["total"] for s in data["sessions"]), 100)
        self.assertEqual({r["id"]: r["tokens"]["codex"] for r in data["orca"]["runs"]},
                         {"run_a": 60, "run_b": 30})
        self.assertNotIn("prices", data)
        self.assertNotIn("cost", data["sessions"][0])
        self.assertEqual(sum(v[0] for s in data["sessions"] for v in s["skills"].values()), 2)

    def test_orchestrator_is_attributed_by_run_command_not_worktree(self):
        now = time.time() - 100
        s = session([call(now), call(now + 10, 20), call(now + 20, 30)])
        note_orca(s, "orca orchestration task-create --run run_a --task-title build", now + 10)
        note_orca(s, "orca orchestration worker-start --run run_b --task task_b", now + 20)
        data = self.build([s], runs=[dict(id=r, tasks=[], gates=[]) for r in ("run_a", "run_b")])
        self.assertEqual(data["attribution"]["unassigned"], 10)
        self.assertEqual([r["orchestrator_tokens"] for r in data["orca"]["runs"]], [20, 30])
        self.assertEqual({s["role"] for s in data["sessions"]}, {"orchestrator"})

    def test_ambiguous_dispatch_and_multi_run_aggregate_stay_unassigned(self):
        now = time.time() - 100
        tasks = {k: dict(id=k, run="run_a", role="builder", title=k) for k in ("a", "b")}
        dispatches = [dict(agent="codex", wt="/repo/worktree", task=k, **{"from": now - 5, "to": now + 5}) for k in tasks]
        data = self.build([session([call(now)])], tasks, dispatches=dispatches)
        self.assertEqual(data["attribution"]["unassigned"], 10)
        s = session([call(now)], aggregate=True)
        s.update(runs=[["run_a", now], ["run_b", now + 1]], dispatcher=True)
        data = self.build([s], runs=[dict(id=r, tasks=[], gates=[]) for r in ("run_a", "run_b")])
        self.assertEqual(data["attribution"]["unassigned"], 10)

    def test_run_lifetime_and_window_totals_are_distinct(self):
        now = time.time() - 10
        s = session([call(now - 10 * 86400, 40), call(now, 10)])
        s["tasks"] = [["a", now - 11 * 86400]]
        task = dict(id="a", run="run_a", role="builder", title="build")
        data = self.build([s], {"a": task}, [dict(id="run_a", tasks=[task], gates=[])])
        self.assertEqual(data["attribution"]["total"], 10)
        self.assertEqual(data["orca"]["runs"][0]["tokens"]["codex"], 50)
        self.assertEqual(data["orca"]["runs"][0]["window_tokens"]["codex"], 10)

    def test_finish_first_keeps_task_reentry(self):
        s = dict(first="", tasks=[["a", 1], ["a", 2], ["b", 3], ["a", 4]], start=1)
        self.assertEqual(finish_first(s)["tasks"], [["a", 1], ["b", 3], ["a", 4]])


if __name__ == "__main__":
    unittest.main()
