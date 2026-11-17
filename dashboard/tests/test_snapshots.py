import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from backend import snapshots


class SnapshotTests(unittest.TestCase):
    def test_first_request_waits_for_background_build_and_warm_reads_do_no_work(self):
        store = snapshots.SnapshotStore()
        with patch.object(snapshots.usage, "build", return_value={"days": 7}) as build, \
             patch.object(snapshots.cache, "save_cache"):
            with ThreadPoolExecutor(2) as pool:
                requests = [pool.submit(store.get, 7) for _ in range(2)]
                with store.condition:
                    self.assertTrue(store.condition.wait_for(lambda: 7 in store.pending, timeout=2))
                self.assertFalse(any(r.done() for r in requests))
                store.refresh(7)
                bodies = [r.result(timeout=2) for r in requests]
            self.assertEqual(bodies[0], bodies[1])
            self.assertEqual(json.loads(bodies[0])["days"], 7)
            self.assertEqual(store.get(7), bodies[0])
            build.assert_called_once_with(7)

    def test_cached_response_remains_available_during_refresh_and_after_failure(self):
        store = snapshots.SnapshotStore()
        started, finish = threading.Event(), threading.Event()
        def slow_build(days):
            started.set()
            finish.wait(2)
            raise ValueError("bad source")
        with patch.object(snapshots.usage, "build", return_value={"days": 7}), \
             patch.object(snapshots.cache, "save_cache"):
            store.refresh(7)
        body = store.get(7)
        with patch.object(snapshots.usage, "build", side_effect=slow_build):
            with ThreadPoolExecutor(2) as pool:
                refresh = pool.submit(store.refresh, 7)
                self.assertTrue(started.wait(2))
                try:
                    self.assertEqual(pool.submit(store.get, 7).result(timeout=1), body)
                finally:
                    finish.set()
                refresh.result(timeout=2)
        self.assertEqual(store.get(7), body)
        with patch.object(snapshots.usage, "build", side_effect=ValueError("bad source")), self.assertRaises(RuntimeError):
            store.refresh(3)
            store.get(3)
