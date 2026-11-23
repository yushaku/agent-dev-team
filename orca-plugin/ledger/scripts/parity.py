"""Compare a fresh parity.ts ledger to Python's parsers on its private source snapshots."""
import collections
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "dashboard"))
from backend.parsers import claude, codex, copilot, hermes, jcode


FILE_PARSERS = dict(claude=claude.parse_claude, codex=codex.parse_codex,
                    copilot=copilot.parse_copilot, jcode=jcode.parse_jcode)
COMMAND_FIELDS = "timestamp rtk_cmd project_path input_tokens output_tokens saved_tokens exec_time_ms".split()


def compare_sessions(expected, actual, diffs):
    # A session ID and most field values can contain identifying or conversational text.
    # Report only the parser-defined field name and number of affected sessions.
    by_id = {session["id"]: session for session in expected}
    for (data,) in actual:
        session = json.loads(data)
        reference = by_id.pop(session["id"], None)
        if reference is None:
            diffs["extra session"] += 1
            continue
        for field in session.keys() | reference.keys():
            if field not in session or field not in reference or session[field] != reference[field]:
                diffs[field] += 1
    diffs["missing session"] += len(by_id)


def compare_commands(db, version, source, path, diffs):
    columns = ", ".join(COMMAND_FIELDS)
    query = f"SELECT {columns} FROM dashboard_commands WHERE version=? AND source=? AND item=?"
    count = 0
    with sqlite3.connect(path) as original:
        for rowid, *expected in original.execute(f"SELECT rowid, {columns} FROM commands"):
            count += 1
            row = db.execute(query, (version, source, f"commands/{rowid}")).fetchone()
            if row is None:
                diffs["missing command"] += 1
            else:
                for field, left, right in zip(COMMAND_FIELDS, expected, row):
                    if left != right:
                        diffs[field] += 1
    actual = db.execute("SELECT count(*) FROM dashboard_commands WHERE version=? AND source=?",
                        (version, source)).fetchone()[0]
    diffs["extra command"] += actual - (count - diffs["missing command"])
    return count


def compare(path, version):
    checked = collections.Counter()
    diffs = collections.defaultdict(collections.Counter)
    pending = 0
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
        for source, kind, name in db.execute("SELECT id,kind,path FROM sources ORDER BY id"):
            if name.endswith("/workspace.yaml"):
                continue
            checked[kind] += 0
            errors = collections.Counter()
            try:
                if kind == "rtk":
                    checked[kind] += compare_commands(db, version, source, name, errors)
                else:
                    if kind == "hermes":
                        hermes.HERMES_DB = name
                        hermes._HERMES_CACHE["ts"] = 0  # One directory may contain several DBs.
                        sessions = hermes.parse_hermes(float("-inf"))
                        # The legacy parser catches SQLite errors and returns an empty list.
                        with sqlite3.connect(name) as original:
                            n = original.execute("SELECT count(*) FROM sessions WHERE started_at IS NOT NULL").fetchone()[0]
                            if n != len(sessions):
                                errors["Python session count"] += abs(n - len(sessions))
                    elif name.endswith(".jsonl") and Path(name).stat().st_size == 0:
                        pending += 1
                        sessions = []
                    else:
                        sessions = [FILE_PARSERS[kind](name)]
                    checked[kind] += len(sessions)
                    rows = db.execute("SELECT data FROM dashboard_sessions WHERE version=? AND source=?", (version, source))
                    compare_sessions(sessions, rows, errors)
            except Exception as exc:
                errors[f"comparison failed ({type(exc).__name__})"] += 1
            diffs[kind].update(errors)
        if db.execute("SELECT 1 FROM sqlite_schema WHERE name='dashboard_errors'").fetchone():
            for kind, n in db.execute("SELECT kind,count(*) FROM dashboard_errors JOIN sources ON source=id WHERE version=? GROUP BY kind", (version,)):
                diffs[kind]["projection error"] += n
    for kind in sorted(checked):
        label = "commands" if kind == "rtk" else "sessions"
        print(f"{kind} {checked[kind]} {label}")
    if pending:
        print(f"{pending} JSONL files await a complete record")
    for kind, errors in sorted(diffs.items()):
        for field, n in sorted(errors.items()):
            if n:
                print(f"  {kind}.{field}: {n}")
    total = sum(sum(errors.values()) for errors in diffs.values())
    print(f"{total} differences")
    return int(total != 0)


if __name__ == "__main__":
    try:
        sys.exit(compare(Path(sys.argv[1]), int(sys.argv[2])))
    except Exception as exc:
        sys.exit(f"Could not compare private ledger ({type(exc).__name__})")
