import json
import os
import re
import shlex
import time
from functools import lru_cache
from pathlib import Path
from datetime import datetime, timezone

from ..config import HOME, RTK_DB, TEAMS

# bin/cg_nudge.py owns the definition of a symbol search; import it by path, disable detection if that fails.
try:
    import importlib.util as _ilu
    _spec = _ilu.spec_from_file_location("cg_nudge", os.path.join(TEAMS, "bin", "cg_nudge.py"))
    CG_NUDGE = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(CG_NUDGE)
except Exception:
    CG_NUDGE = None

# ---------------------------------------------------------------- helpers
SKILL_RE = re.compile(r"/skills/([A-Za-z0-9._-]+)/SKILL\.md")
ORCA_SKILL_RE = re.compile(r"orca skills get ([A-Za-z0-9._-]+)")
TASK_RE = re.compile(r"Your task ID is:\s*(task_[0-9a-f]+)")
# A coordinator starts workers: the command itself, not a mention, a grep or --help.
ORCH_RE = re.compile(r"(?:^|[;&|(\n]|\bsh\s+-l?c\s+['\"])\s*(?:rtk\s+(?:proxy\s+)?)?orca\s+orchestration\s+"
                     r"(?:worker-start|task-create|dispatch|run-use)\b(?![^;&|\n]*--help)")
CMD_STR_RE = re.compile(r"""\bcmd\s*:\s*(["'`])((?:\\.|(?!\1).)*)\1""", re.S)  # Codex exec: exec_command({cmd:"..."})
CLAUDE_CMD_RE = re.compile(r"<command-name>/([^<\s]+)</command-name>")
HERMES_SKILL_RE = re.compile(r'^\[IMPORTANT: The user has invoked the "([^"]+)" skill')
HERMES_ARGS_MARK = "The user has provided the following instruction alongside the skill invocation:"
COPILOT_TYPES = ('"type":"session.start"', '"type":"session.resume"', '"type":"user.message"',
                 '"type":"session.usage_record"', '"type":"session.usage_checkpoint"', '"type":"session.shutdown"',
                 '"type":"model.model_call_success"', '"type":"skill.invoked"', '"type":"skill.invoked_ref"')

# Skills a hook injects into the context (no load by the agent): header -> skill name.
HOOK_MARKS = [("PONYTAIL MODE ACTIVE", "ponytail")]
HOOK_LEVEL_RE = re.compile(r"level:\s*([A-Za-z0-9_-]+)")

def ts_of(s):
    """ISO string (Z or naive UTC like Orca's '2026-11-06 09:10:55') to epoch seconds."""
    if not s:
        return None
    try:
        s = s.replace("Z", "+00:00").replace(" ", "T")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.timestamp()
    except ValueError:
        return None

def local_date(ts):
    return time.strftime("%Y-%m-%d", time.localtime(ts))

@lru_cache(maxsize=2048)
def main_checkout(cwd):
    if not cwd:
        return None
    for root in (Path(cwd), *Path(cwd).parents):
        git = root / ".git"
        if git.is_dir():
            return str(root)
        if git.is_file():
            try:
                target = git.read_text().strip().removeprefix("gitdir: ")
                gitdir = (root / target).resolve()
                common = (gitdir / "commondir").read_text().strip()
                return str((gitdir / common).resolve().parent)
            except OSError:
                return None
    return None


def repo_of(cwd):
    """(repo, worktree) from a working directory; never returns the path itself."""
    if not cwd:
        return "?", "?"
    p = os.path.normpath(cwd)
    checkout = main_checkout(p)
    if checkout:
        return os.path.basename(checkout), "(main)" if p == checkout or p.startswith(checkout + os.sep) else os.path.basename(p)
    ws = os.path.join(HOME, "orca", "workspaces") + os.sep
    pj = os.path.join(HOME, "orca", "projects") + os.sep
    if p.startswith(ws):
        parts = p[len(ws):].split(os.sep)
        return parts[0], (parts[1] if len(parts) > 1 else "(main)")
    if p.startswith(pj):
        return p[len(pj):].split(os.sep)[0], "(main)"
    if os.path.dirname(p) == os.path.normpath(HOME) or os.path.isdir(os.path.join(p, ".git")):  # ~/<dir> or a git main checkout: the dir itself is the repo
        return os.path.basename(p), "(main)"
    parts = [x for x in p.split(os.sep) if x]
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return (parts[0] if parts else "?"), "?"

# Code search kinds counted per tool call (see note_search).
# read_full = whole file into context (Read without range, cat); read_part = a line range (head/tail/sed -n, Read limit).
SEARCH_KINDS = ("codegraph", "rg", "grep", "find", "read_full", "read_part")
CG_TOOL_RE = re.compile(r"codegraph", re.I)
SEARCH_CMD_RE = {
    "codegraph": re.compile(r"(?:^|[;&|(\s'\"`])codegraph\s+(?:explore|query|node|callers|callees|impact|affected|files|context|search)\b"),
    "rg": re.compile(r"(?:^|[;&|(\s'\"`])(?:rtk\s+(?:proxy\s+)?)?rg\s"),
    "grep": re.compile(r"(?:^|[;&|(\s'\"`])(?:rtk\s+(?:proxy\s+)?)?(?:git\s+)?grep\s"),
    "find": re.compile(r"(?:^|[;&|(\s'\"`])(?:find|fd)\s"),
    "read_full": re.compile(r"(?:^|[;&(\s'\"`])cat\s+[^|<>]*[\w/.]"),
    "read_part": re.compile(r"(?:^|[;&(\s'\"`])(?:head|tail|sed\s+-n)\s+[^|]*[\w/.]+\.\w+"),
}
READ_TOOLS = {"read", "view", "read_file"}
RANGE_KEYS = ("limit", "offset", "start_line", "end_line", "view_range", "line_range")
TOOL_KIND = {"grep": "grep", "glob": "find", "search_files": "grep", "agentgrep": "grep", "find_files": "find"}


def search_kinds(name, args, cwd=None):
    """Search kinds used by one tool call. Codegraph wins: MCP tool name or a `codegraph <query>` command."""
    name = str(name or "")
    if CG_TOOL_RE.search(name):
        return ["codegraph"]
    if name.lower() in READ_TOOLS:
        a = args
        if isinstance(a, str):
            try:
                a = json.loads(a)
            except ValueError:
                a = {}
        ranged = isinstance(a, dict) and any(a.get(k) not in (None, "", 0) for k in RANGE_KEYS)
        return ["read_part" if ranged else "read_full"]
    kind = TOOL_KIND.get(name.lower())
    if kind:
        return [kind]
    cmd = cmd_text(args)
    if not cmd:
        return []
    if SEARCH_CMD_RE["codegraph"].search(cmd) or "codegraph_" in cmd:
        return ["codegraph"]
    kinds = [k for k in SEARCH_KINDS[1:] if SEARCH_CMD_RE[k].search(cmd)]
    if cwd and CG_NUDGE and ("rg" in kinds or "grep" in kinds):
        try:  # extra kind, not a bar segment: rg/grep for a symbol in a repo that has .codegraph/
            if CG_NUDGE.symbol_searches(cmd) and CG_NUDGE.indexed_root(cwd, cmd):
                kinds.append("rg_symbol")
        except Exception:
            pass
    return kinds


def note_search(s, name, args, ts=None, cwd=None):
    for k in search_kinds(name, args, cwd):
        s.setdefault("search", []).append([k, ts])


def cmd_text(v):
    """Shell command(s) of a tool call: JSON {command|cmd}, an argv list, or Codex exec JS source."""
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return "\n".join(m[1].replace("\\n", "\n") for m in CMD_STR_RE.findall(v))
    if isinstance(v, dict):
        v = v.get("command") or v.get("cmd") or ""
    if isinstance(v, list):
        v = [str(e) for e in v]
        v = "\n".join(e for e in v if " " in e) or " ".join(v)
    return v if isinstance(v, str) else ""

def note_orca(s, command, ts):
    for match in ORCH_RE.finditer(command):
        s["dispatcher"] = True
        try:
            args = shlex.split(re.split(r"[;\n]", command[match.end():])[0])
        except ValueError:
            continue
        for i, arg in enumerate(args):
            flag = "--id" if "run-use" in match.group() else "--run"
            rid = args[i + 1] if arg == flag and i + 1 < len(args) else arg[len(flag) + 1:] if arg.startswith(flag + "=") else ""
            if re.fullmatch(r"run_[0-9a-z]+", rid):
                runs = s.setdefault("runs", [])
                if not runs or runs[-1][0] != rid:
                    runs.append([rid, ts])

def hook_skill(text, s, ts):
    """Record a hook-injected skill once per session, with its level when the header has one."""
    head = (text or "")[:200]
    for mark, name in HOOK_MARKS:
        if mark in head and name not in s["hooks"]:
            m = HOOK_LEVEL_RE.search(head)
            s["hooks"][name] = [ts, m.group(1) if m else ""]

def skills_in(text):
    out = SKILL_RE.findall(text or "")
    out += ORCA_SKILL_RE.findall(text or "")
    return out

def finish_first(s):
    """Keep only a 160 char preview, the role hint and the Orca task id of the first prompt."""
    from ..roles import discussion_role, known_roles, role_from_text
    txt = s.pop("first") or ""
    roles = known_roles()
    s["preview"] = re.sub(r"\s+", " ", txt).strip()[:160]
    s["role_line"] = role_from_text(txt, roles)
    # Discussion roles are PO sessions; a subagent (Hermes title "Subagent: ...") never is one.
    sub = s.get("subagent") or (s.get("title") or "").startswith("Subagent:")
    s["discussion"] = None if sub else discussion_role(txt) or s.get("discussion_read")
    tasks = []
    for item in s.get("tasks") or []:
        if not tasks or tasks[-1][0] != item[0]:
            tasks.append(item)
    s["tasks"] = tasks
    m = TASK_RE.search(txt)
    if m and not any(x[0] == m.group(1) for x in tasks):
        s["tasks"].insert(0, [m.group(1), s["start"]])
    return s

def parse_rtk(start_date=None):
    """RTK (Rust Token Killer) savings from its local history DB, read only."""
    import sqlite3
    if not os.path.exists(RTK_DB):
        return {"available": False}
    w = " WHERE timestamp >= ?" if start_date else ""
    p = (start_date,) if start_date else ()
    try:
        conn = sqlite3.connect("file://%s" % RTK_DB, uri=True, timeout=10)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        s = cur.execute("SELECT COUNT(*) AS n, SUM(input_tokens) AS inp, SUM(output_tokens) AS outp, "
                        "SUM(saved_tokens) AS saved, SUM(exec_time_ms) AS ms FROM commands" + w, p).fetchone()
        inp = s["inp"] or 0
        summary = {"commands": s["n"] or 0, "input": inp, "output": s["outp"] or 0,
                   "saved": s["saved"] or 0, "pct": round((s["saved"] or 0) / (inp or 1) * 100, 1), "time_ms": s["ms"] or 0}
        by_cmd = [{"cmd": r["cmd"], "n": r["n"], "saved": r["saved"] or 0, "input": r["inp"] or 0,
                   "output": r["outp"] or 0, "pct": round((r["saved"] or 0) / (r["inp"] or 1) * 100, 1)} for r in cur.execute(
            "SELECT rtk_cmd AS cmd, COUNT(*) AS n, SUM(saved_tokens) AS saved, SUM(input_tokens) AS inp, "
            "SUM(output_tokens) AS outp FROM commands" + w + " GROUP BY rtk_cmd ORDER BY saved DESC LIMIT 15", p)]
        daily = [{"date": r["d"], "n": r["n"], "saved": r["saved"] or 0, "input": r["inp"] or 0,
                  "output": r["outp"] or 0, "pct": round((r["saved"] or 0) / (r["inp"] or 1) * 100, 1)} for r in cur.execute(
            "SELECT substr(timestamp, 1, 10) AS d, COUNT(*) AS n, SUM(saved_tokens) AS saved, "
            "SUM(input_tokens) AS inp, SUM(output_tokens) AS outp FROM commands" + w + " GROUP BY d ORDER BY d", p)]
        wp = ("timestamp >= ?" if start_date else "1=1") + " AND project_path != ''"
        pp = (start_date,) if start_date else ()
        by_project = [{"project": os.path.relpath(r["p"], HOME), "n": r["n"], "saved": r["saved"] or 0,
                       "pct": round((r["saved"] or 0) / (r["inp"] or 1) * 100, 1)} for r in cur.execute(
            "SELECT project_path AS p, COUNT(*) AS n, SUM(saved_tokens) AS saved, SUM(input_tokens) AS inp "
            "FROM commands WHERE " + wp + " GROUP BY p ORDER BY saved DESC LIMIT 15", pp)]
        conn.close()
        return {"available": True, "summary": summary, "by_cmd": by_cmd, "daily": daily, "by_project": by_project}
    except Exception:
        return {"available": False}


def note_branch(s, ts, cwd=None, branch=None, source="message_context"):
    segments = s.setdefault("branch_segments", [])
    previous = segments[-1] if segments else dict(cwd=None, branch=None, branch_source="unavailable")
    context = dict(cwd=cwd or previous["cwd"], branch=previous["branch"], branch_source=previous["branch_source"])
    if cwd and cwd != previous["cwd"]:
        context["branch"] = None
        context["branch_source"] = "unavailable"
    if branch is not None:
        context["branch"] = branch
        context["branch_source"] = source
    if not segments or any(context[k] != previous[k] for k in context):
        segments.append(dict(context, at=ts))
    return context


def branch_at(s, ts):
    segments = s.get("branch_segments")
    if segments is None:
        return dict(cwd=s.get("cwd"), branch=s.get("branch"))
    return next((x for x in reversed(segments) if x["at"] is None or (ts is not None and x["at"] <= ts)),
                dict(cwd=s.get("cwd"), branch=None))


def loaded_skills(s):
    """Agent loads plus hook-injected skills (once per session unless also loaded). name -> count."""
    out = {k: v[0] for k, v in (s.get("skills") or {}).items()}
    for k in s.get("hooks") or {}:
        out.setdefault(k, 1)
    return out
