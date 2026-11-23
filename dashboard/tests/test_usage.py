import copy
import os
import time
import unittest
from unittest.mock import patch

from backend import usage
from backend.parsers.common import finish_first, note_orca
from backend.parsers.common import ts_of
from backend.parsers.claude import parse_claude
from backend.parsers.codex import parse_codex


def session(calls, **extra):
    return dict(agent="codex", id="session", cwd="/repo/worktree", start=calls[0][0],
                end=calls[-1][0], calls=calls, tasks=[], runs=[], dispatcher=False,
                role_line=None, skills=[], hooks={}, preview="", **extra)


def call(ts, tokens=10):
    return [ts, "test-model", "medium", tokens, 0, 0, 0, 0, None]


class UsageTests(unittest.TestCase):
    def test_branch_switch_fixtures_split_features_and_preserve_session_views(self):
        for agent, parser, total, branches, unassigned in (
                ("claude", parse_claude, 466, {"feat/switch": 265, "feat/second": 55}, 146),
                ("codex", parse_codex, 520, {"feat/switch": 290}, 230)):
            with self.subTest(agent=agent):
                path = os.path.join(os.path.dirname(__file__), "fixtures", agent + "_branch_switch.jsonl")
                parsed = parser(path)
                with patch.object(usage.time, "time", return_value=ts_of("2026-11-13T00:01:00Z")):
                    data = self.build([parsed])
                self.assertEqual(len(data["sessions"]), 1)
                row = data["sessions"][0]
                self.assertEqual((row["branch"], row["cwd"], row["total"]), ("main", "/repo/main", total))
                self.assertEqual(data["attribution"]["total"], total)
                self.assertEqual(sum(s["total"] for s in row["feature_segments"]), total)
                self.assertEqual({f["branch"]: f["tokens"] for f in data["features"]["runs"]}, branches)
                self.assertEqual(data["features"]["attribution"]["unassigned"], unassigned)
                feature = next(f for f in data["features"]["runs"] if f["branch"] == "feat/switch")
                self.assertEqual(feature["session_count"], 1)
                self.assertEqual(feature["sources"]["branch"], ["message_context"])
                self.assertEqual(feature["loaded_skills"]["code-review"], 1)
                self.assertEqual(feature["fix_rounds"], dict(count=0, source="code-review"))
                self.assertEqual(row["skills"]["code-review"][0], 2)

    def build(self, sessions, tasks=None, runs=None, dispatches=None):
        state = dict(tasks=tasks or {}, runs=runs or [], dispatches=dispatches or [],
                     available=True, error=None, fetched_at=time.time())
        with patch.object(usage.cache, "load_files", return_value=copy.deepcopy(sessions)), \
             patch.object(usage.hermes, "parse_hermes", return_value=[]), \
             patch.object(usage.orca_mod, "orca_state", state), \
             patch.object(usage, "parse_rtk", return_value={"available": False}):
            return usage.build(7)

    def test_role_defaults_do_not_depend_on_a_model_registry(self):
        config = usage.read_tiers()
        self.assertEqual(config["tiers"], {})
        self.assertEqual(config["roles"]["reviewer"]["tier"], "top")
        self.assertIsNone(config["roles"]["builder"]["agent"])

    def test_session_carries_resolved_task_routing(self):
        now = time.time() - 100
        routing = dict(tier="work", catalog="my-code", agent="codex", model="test-model", effort="medium", dispatch="d1")
        task = dict(id="a", run="run_a", role="builder", title="build", routing=[routing])
        s = session([call(now)])
        s["tasks"] = [["a", now]]
        data = self.build([s], {"a": task}, runs=[dict(id="run_a", tasks=[task], gates=[])], dispatches=[dict(id="d1", agent="codex", task="a", wt="/repo/worktree", **{"from": now - 1, "to": now + 1})])
        self.assertEqual(data["sessions"][0]["routing"], routing)
        s["aggregate"] = True
        data = self.build([s], {"a": task}, runs=[dict(id="run_a", tasks=[task], gates=[])], dispatches=[dict(id="d1", agent="codex", task="a", wt="/repo/worktree", **{"from": now - 1, "to": now + 1})])
        self.assertIsNone(data["sessions"][0]["routing"])

    def test_rerouting_the_same_task_keeps_each_dispatch_selection(self):
        now = time.time() - 100
        records = [dict(tier=tier, catalog=alias, agent="codex", model="test-model", effort="medium", dispatch=did)
                   for tier, alias, did in (("fast", "quick", "d1"), ("work", "code", "d2"))]
        task = dict(id="a", run="run_a", role="builder", title="build", routing=records)
        dispatches = [dict(id=did, agent="codex", task="a", wt="/repo/worktree", **{"from": start, "to": end})
                      for did, start, end in (("d1", now - 50, now - 20), ("d2", now - 10, now + 5))]
        s = session([call(now - 40, 10), call(now - 5, 20)])
        s["tasks"] = [["a", now - 50]]
        data = self.build([s], {"a": task}, [dict(id="run_a", tasks=[task], gates=[])], dispatches)
        self.assertEqual({row["routing"]["catalog"]: row["total"] for row in data["sessions"]}, {"quick": 10, "code": 20})
        self.assertIsNone(usage.routing_at(task, dispatches, "codex", now - 15))
        self.assertIsNone(usage.routing_at(task, dispatches, "claude", now - 5))
        dispatches[0]["to"] = now + 5
        self.assertIsNone(usage.routing_at(task, dispatches, "codex", now - 5))

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
        self.assertEqual([r["orchestrator_activity"] for r in data["orca"]["runs"]], [
            [dict(agent="codex", start=now + 10, end=now + 10, tokens=20)],
            [dict(agent="codex", start=now + 20, end=now + 20, tokens=30)],
        ])
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
