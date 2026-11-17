"""Build JSON responses in the background; readers keep the last complete result."""
import json
import threading
import time

from . import cache, usage


class SnapshotStore:
    def __init__(self):
        self.condition = threading.Condition()
        self.bodies = {}
        self.errors = {}
        self.pending = set()

    def get(self, days):
        with self.condition:
            if days not in self.bodies and days not in self.errors:
                self.pending.add(days)
                self.condition.notify_all()
                self.condition.wait_for(lambda: days in self.bodies or days in self.errors)
            if days in self.bodies:
                return self.bodies[days]
            raise RuntimeError(self.errors[days])

    def refresh(self, days):
        try:
            t0 = time.monotonic()
            with cache.lock:
                data = usage.build(days)
                cache.save_cache()
            data["build_ms"] = int((time.monotonic() - t0) * 1000)
            body = json.dumps(data, separators=(",", ":")).encode()
        except Exception as error:
            print("Dashboard refresh failed: %s" % type(error).__name__, flush=True)
            with self.condition:
                self.errors[days] = type(error).__name__
                self.condition.notify_all()
            return
        with self.condition:
            self.bodies[days] = body
            self.errors.pop(days, None)
            self.condition.notify_all()

    def loop(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.pending, timeout=30)
                days = list(self.pending or (self.bodies.keys() | self.errors.keys()))
                self.pending.clear()
            for day in days:
                self.refresh(day)


store = SnapshotStore()
