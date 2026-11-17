import unittest
from unittest.mock import patch

from backend import orca
from backend.orca import task_measurement, run_stage


class OrcaMetricsTests(unittest.TestCase):
    def test_metadata_wins_and_historical_titles_are_estimates(self):
        self.assertEqual(task_measurement({"task_title": "builder: fix header"})["kind"], "fix")
        self.assertEqual(task_measurement({"task_title": "builder: fix header"})["source"], "title")
        task = {"task_title": "builder: fix header", "spec":
                'Measurement: {"kind":"build","round":null,"cause":null}'}
        self.assertEqual(task_measurement(task)["kind"], "build")
        self.assertIsNone(task_measurement({"task_title": "fix: header"})["round"])

    def test_rounds_are_not_task_counts_and_invalid_metadata_is_unknown(self):
        task = {"spec": 'Measurement: {"kind":"fix","round":2,"cause":"defect"}'}
        self.assertEqual(task_measurement(task)["round"], 2)
        self.assertEqual(task_measurement(task)["cause"], "defect")
        self.assertIsNone(task_measurement({"spec": 'Measurement: {"kind":"fix","round":-1}'})["round"])

    def test_spec_approval_does_not_mean_delivery(self):
        gates = [dict(kind="approve", stage="spec")]
        tasks = [dict(status="completed", measurement=dict(kind="spec"))]
        self.assertEqual(run_stage({}, tasks, gates), "unknown")
        gates = [dict(kind="pending", stage="delivery")]
        self.assertEqual(run_stage({}, tasks, gates), "awaiting_delivery")
        gates[0]["kind"] = "approve"
        tasks.append(dict(status="completed", measurement=dict(kind="delivery")))
        self.assertEqual(run_stage({}, tasks, gates), "delivered")
        self.assertEqual(run_stage({"status": "merged"}, tasks, gates), "merged")
        self.assertEqual(run_stage({"status": "cancelled"}, tasks, gates), "cancelled")

    def test_events_resolve_reused_workers_by_message_time_and_keep_unknown_addresses(self):
        tasks = [dict(id="old", title="Builder old"), dict(id="new", title="Builder new"), dict(id="review", title="Reviewer")]
        workers = [dict(dispatchId=d, taskId=t, agentTerminalHandle=h) for d, t, h in
                   (("d1", "old", "shared"), ("d2", "new", "shared"), ("d3", "review", "reviewer"))]
        known = {"d1": {"from": 100}, "d2": {"from": 300}, "d3": {"from": 100}}
        messages = [dict(id="m", created_at="1970-01-01T00:03:20Z", from_handle="shared", to_handle="dispatch:d3",
                         subject="API?", body="Details", payload="{}"),
                    dict(id="unknown", created_at="1970-01-01T00:06:40Z", from_handle="missing", to_handle="run:r", payload="bad json")]
        events = orca.run_events("r", tasks, [], workers, known, messages)
        mail = next(e for e in events if e["id"] == "m")
        self.assertEqual((mail["from"], mail["to"], mail["kind"]), ("Builder old", "Reviewer", "peer"))
        self.assertEqual(mail["body"], "Details")
        self.assertEqual((mail["from_task"], mail["to_task"]), ("old", "review"))
        self.assertEqual((mail["from_actor"], mail["to_actor"]), ("shared", "reviewer"))
        dispatch_events = [e for e in events if e["kind"] == "dispatch" and e["to_actor"] == "shared"]
        self.assertEqual(len(dispatch_events), 2)
        self.assertEqual(next(e for e in events if e["id"] == "unknown")["from"], "missing")
        self.assertEqual(len([e for e in events if e["kind"] == "dispatch"]), 3)

    def test_refresh_reads_worker_pages_and_unions_gate_wait(self):
        worker_pages = []

        def fake(command, *args):
            if command == "run-list":
                return {"runs": [dict(id="run_a", objective="test", created_at="2026-11-13T00:00:00Z")]}
            if command == "worker-list":
                worker_pages.append(args)
                return {"workers": [], "page": {"nextCursor": None if "--cursor" in args else "next"}}
            if command == "task-list":
                return {"tasks": [dict(id=k, task_title=k, status="completed", spec='Measurement: {"kind":"' + kind + '"}')
                                  for k, kind in (("deliver", "delivery"), ("close", "close"))]}
            if command == "inbox":
                return {"messages": []}
            if command == "gate-list":
                return {"gates": [dict(id=str(i), task_id=task, status="resolved", resolution="approve",
                                       created_at=f"2026-11-13T00:00:{a}Z", resolved_at=f"2026-11-13T00:00:{b}Z")
                                  for i, task, a, b in ((1, "deliver", "10", "30"), (2, "close", "20", "40"))]}
            self.fail(command)

        state = dict(runs=[], tasks={}, dispatches=[])
        with patch.object(orca, "orca", side_effect=fake), patch.object(orca, "orca_state", state), \
             patch.object(orca.cache, "cache", {"dispatch": {}}):
            orca.refresh_orca()
        r = state["runs"][0]
        self.assertEqual(len(worker_pages), 2)
        self.assertEqual(r["stage"], "delivered")
        self.assertEqual(r["lead_seconds"], 40)
        self.assertEqual(r["gate_wait_seconds"], 30)
        self.assertEqual(len([e for e in r["events"] if e["kind"] == "gate_question"]), 2)
        self.assertEqual(len([e for e in r["events"] if e["kind"] == "gate_answer"]), 2)
        with patch.object(orca, "orca", side_effect=lambda command, *args: None if command == "inbox" else fake(command, *args)), \
             patch.object(orca, "orca_state", state), patch.object(orca.cache, "cache", {"dispatch": {}}):
            orca.refresh_orca()
        self.assertTrue(state["available"])
        self.assertFalse(state["runs"][0]["messages_available"])
        self.assertEqual(len(state["runs"][0]["events"]), 4)


if __name__ == "__main__":
    unittest.main()
