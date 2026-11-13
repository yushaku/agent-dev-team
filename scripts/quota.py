#!/usr/bin/env python3
"""Print remaining quota of the installed coding agents as JSON.

Usage: quota.py [--fresh]
Cache: ~/.cache/agent-team/quota.json, 15 minutes (--fresh bypasses).
Output: {agent: {used_pct, remaining_pct, window, resets_at, plan, source, ok, error}}
Probes: claude and cursor run /usage in a q_<agent> tmux session under $AGENT_TEAM_SCRATCH;
codex reads the last logged rate_limits sample (sample_age_min); copilot calls gh api.
A failed probe sets ok false and error; a missing CLI is a failure, never a crash.
"""
import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

CACHE = os.path.expanduser("~/.cache/agent-team/quota.json")
TTL = 15 * 60
_HERMES_SCRATCH = os.path.expanduser("~/.hermes/cache/scratch")
SCRATCH = os.environ.get("AGENT_TEAM_SCRATCH") or (_HERMES_SCRATCH if os.path.isdir(_HERMES_SCRATCH) else tempfile.gettempdir())
TAIL_BYTES = 8 * 1024 * 1024
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def blank(source):
    return {"used_pct": None, "remaining_pct": None, "window": None, "resets_at": None,
            "plan": None, "source": source, "ok": False, "error": None}


def finish(r):
    if r["used_pct"] is not None:
        r["used_pct"] = round(float(r["used_pct"]), 1)
        r["remaining_pct"] = round(100 - r["used_pct"], 1)
    return r


def iso(epoch):
    return datetime.datetime.fromtimestamp(epoch).astimezone().isoformat(timespec="minutes")


# codex: last rate_limits object in the newest session logs
def probe_codex():
    r = blank("~/.codex/sessions/*/*/*/*.jsonl (last rate_limits)")
    if not shutil.which("codex"):
        r["error"] = "codex CLI not found"
        return r
    files = sorted(glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/*.jsonl")),
                   key=os.path.getmtime, reverse=True)
    for path in files[:20]:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - TAIL_BYTES))
            lines = f.read().decode("utf-8", "replace").splitlines()
        for line in reversed(lines):
            if '"rate_limits"' not in line:
                continue
            try:
                rl = json.loads(line)
            except ValueError:
                continue
            while isinstance(rl, dict) and "rate_limits" not in rl:
                rl = next((v for v in rl.values() if isinstance(v, dict) and
                           ("rate_limits" in v or "payload" in v or "info" in v)), None) or {}
            rl = (rl or {}).get("rate_limits")
            if not rl or not rl.get("primary"):
                continue
            p, s = rl["primary"], rl.get("secondary")
            r.update(used_pct=p["used_percent"], window="%s min" % p.get("window_minutes"),
                     resets_at=iso(p["resets_at"]) if p.get("resets_at") else None,
                     plan=rl.get("plan_type"), ok=True)
            r["credits"] = rl.get("credits")
            r["sample_age_min"] = round((time.time() - os.path.getmtime(path)) / 60)
            if s:
                r["secondary"] = {"used_pct": s.get("used_percent"),
                                  "window": "%s min" % s.get("window_minutes"),
                                  "resets_at": iso(s["resets_at"]) if s.get("resets_at") else None}
                if s.get("used_percent", 0) > p["used_percent"]:
                    r["used_pct"] = s["used_percent"]
            return finish(r)
    r["error"] = "no rate_limits sample in recent codex sessions"
    return r


# copilot: gh api /copilot_internal/user
def probe_copilot():
    r = blank("gh api /copilot_internal/user")
    if not shutil.which("gh"):
        r["error"] = "gh CLI not found"
        return r
    if not shutil.which("copilot"):
        r["error"] = "copilot CLI not found"
        return r
    p = subprocess.run(["gh", "api", "/copilot_internal/user"], capture_output=True, text=True, timeout=30)
    if p.returncode:
        r["error"] = "gh api failed: " + (p.stderr.strip() or p.stdout.strip())[:200]
        return r
    d = json.loads(p.stdout)
    snaps = d.get("quota_snapshots") or {}
    prem = snaps.get("premium_interactions") or {}
    snap, name = (prem, "premium_interactions") if (prem.get("entitlement") or 0) > 0 \
        else (snaps.get("chat") or {}, "chat")
    if snap.get("percent_remaining") is None:
        r["error"] = "no %s snapshot" % name
        return r
    r.update(used_pct=100 - snap["percent_remaining"], window="monthly (%s)" % name,
             resets_at=d.get("quota_reset_date"), plan=d.get("copilot_plan"), ok=True)
    r["entitlement"] = snap.get("entitlement")
    r["remaining"] = snap.get("remaining")
    return finish(r)


# TUI probes (claude, cursor-agent) through tmux
def tmux(*args):
    return subprocess.run(["tmux", *args], capture_output=True, text=True, timeout=15)


def pane(session):
    return ANSI.sub("", tmux("capture-pane", "-p", "-t", session).stdout)


def wait_for(session, pattern, timeout):
    end = time.time() + timeout
    text = ""
    while time.time() < end:
        text = pane(session)
        if re.search(pattern, text):
            return text
        time.sleep(1)
    return text


def drive(session, cmd, ready, done, quit_keys):
    """Run `cmd` in a fresh tmux session, send /usage, return the pane text once `done` matches."""
    tmux("kill-session", "-t", session)
    tmux("new-session", "-d", "-s", session, "-x", "160", "-y", "50", "-c", SCRATCH, "zsh -l")
    try:
        time.sleep(1)
        tmux("send-keys", "-t", session, cmd, "Enter")
        wait_for(session, ready, 15)
        time.sleep(1)
        tmux("send-keys", "-t", session, "-l", "/usage")
        time.sleep(2)
        tmux("send-keys", "-t", session, "Enter")
        return wait_for(session, done, 20)
    finally:
        for k in quit_keys:
            tmux("send-keys", "-t", session, *k)
            time.sleep(1)
        tmux("kill-session", "-t", session)


def probe_claude():
    r = blank("tmux: claude /usage")
    if not shutil.which("claude"):
        r["error"] = "claude CLI not found"
        return r
    if not shutil.which("tmux"):
        r["error"] = "tmux not found"
        return r
    text = drive("q_claude", "claude", r"\? for shortcuts|Claude Code|Welcome", r"Current week \(all models\)[\s\S]*?Resets [^\n]+",
                 [("Escape",), ("-l", "/exit"), ("Enter",)])
    m = re.search(r"Current week \(all models\)\s*\n[^\n]*?(\d+(?:\.\d+)?)% used\s*\n\s*Resets ([^\n]+)", text)
    if not m:
        r["error"] = "could not parse 'Current week (all models)' from /usage"
        return r
    r.update(used_pct=float(m.group(1)), window="week (all models)", resets_at=m.group(2).strip(), ok=True)
    r["plan"] = claude_plan()
    return finish(r)


def claude_plan():
    try:
        p = subprocess.run(["claude", "auth", "status"], capture_output=True, text=True, timeout=20)
        d = json.loads(p.stdout)
        return d.get("subscriptionType") or d.get("plan")
    except Exception:
        return None


def probe_cursor():
    r = blank("tmux: cursor-agent /usage")
    exe = shutil.which("cursor-agent") or os.path.expanduser("~/.local/bin/cursor-agent")
    if not os.path.exists(exe):
        r["error"] = "cursor-agent CLI not found"
        return r
    if not shutil.which("tmux"):
        r["error"] = "tmux not found"
        return r
    text = drive("q_cursor", "cursor-agent", r"Cursor Agent|Tip:", r"Included\s+\d+(?:\.\d+)?% used",
                 [("Escape",), ("C-c",), ("C-c",)])
    plan = re.search(r"Usage\s*•\s*(\S+)", text)
    reset = re.search(r"Resets ([A-Z][a-z]{2} \d+)", text)
    used = re.search(r"Included\s+(\d+(?:\.\d+)?)% used", text)
    if not used:
        r["error"] = "could not parse 'Included <N>% used' from /usage"
        return r
    r.update(used_pct=float(used.group(1)), window="month (included)",
             resets_at=reset.group(1) if reset else None, plan=plan.group(1) if plan else None, ok=True)
    return finish(r)


PROBES = {"claude": probe_claude, "codex": probe_codex, "copilot": probe_copilot, "cursor": probe_cursor}


def run_probe(name):
    try:
        return PROBES[name]()
    except Exception as e:  # a probe never crashes the script
        r = blank(name)
        r["error"] = "%s: %s" % (type(e).__name__, e)
        return r


def main():
    fresh = "--fresh" in sys.argv[1:]
    if not fresh and os.path.exists(CACHE) and time.time() - os.path.getmtime(CACHE) < TTL:
        try:
            print(open(CACHE).read().rstrip())
            return
        except OSError:
            pass
    out = {name: run_probe(name) for name in PROBES}
    text = json.dumps(out, indent=2)
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, "w") as f:
            f.write(text + "\n")
    except OSError:
        pass
    print(text)


if __name__ == "__main__":
    main()
