"""GET /api/quota: runs scripts/quota.py under the team root (cached 15 min by the script itself)."""

import json
import os
import subprocess
import sys
import threading
import time

from .config import TEAMS

SCRIPT = os.path.join(TEAMS, "scripts", "quota.py")
TIMEOUT = 60
_lock = threading.Lock()


def get(fresh=False):
    """Never raises: returns the script JSON plus checked_at, or {error, checked_at}."""
    with _lock:
        try:
            cmd = [sys.executable or "python3", SCRIPT] + (["--fresh"] if fresh else [])
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
            data = json.loads(p.stdout)
            if not isinstance(data, dict):
                raise ValueError("unexpected output")
            data["checked_at"] = int(time.time())
            return data
        except subprocess.TimeoutExpired:
            err = "quota.py quá %d giây" % TIMEOUT
        except Exception as e:  # noqa: BLE001 - endpoint must never raise
            err = "quota.py lỗi: %s" % str(e)[:200]
        return {"error": err, "checked_at": int(time.time())}
