"""Server-side aggregation and issue detection over the /api/data payload.

Pure functions: no log parsing, only data already in the snapshot. Python 3.9 stdlib.
Used by /api/agent/summary and /api/agent/run (see handle()).
"""
import glob
import json
import os
import re
import statistics
import time

from . import snapshots
from .parsers.common import loaded_skills
from .config import TEAMS
from .roles import COMMAND_ROLES, DIRECT_ROLE, TEAM_PREFIX

# ---- thresholds
MAX_FIX_ROUNDS = 2            # check 3: more than this many fix rounds in one Run
OUTLIER_FACTOR = 3.0          # check 4: session total above N x role median
OUTLIER_HIGH_FACTOR = 10.0
OUTLIER_MIN_SESSIONS = 5      # check 4: roles with fewer sessions are skipped
GATE_WAIT_SHARE = 0.5         # check 6: PO gate wait above this share of lead time
GATE_WAIT_HIGH_SHARE = 0.8
GATE_MIN_LEAD_SECONDS = 600   # check 6: ignore Runs shorter than this
TOP_TIER_HIGH_TOKENS = 5_000_000  # check 1: severity high above this many top-tier tokens
SYMBOL_RG_MIN = 3             # check 7: rg/grep symbol lookups in an indexed repo per Run + role
SKILLS_SHOWN = 8              # markdown only; JSON lists all skills
EVIDENCE_IDS = 3              # ids listed per evidence line
EFFORT = ["minimal", "low", "medium", "high", "xhigh"]
SEVERITY = {"high": 0, "medium": 1, "low": 2}
FIX_KINDS = ("fix",)
REREVIEW_KIND = "re-review"


def fmt(n):
    if n is None:
        return "?"
    a = abs(n)
    for div, suf in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if a >= div:
            return ("%.1f" % (n / div)).rstrip("0").rstrip(".") + suf
    return str(int(n))


def dur(sec):
    if sec is None:
        return "?"
    m = int(round(sec / 60))
    return "%dm" % m if m < 60 else "%dh%02dm" % (m // 60, m % 60)


def sid(s):
    return "%s:%s" % (s.get("agent"), s.get("session_id") or s.get("id"))


def ids(items, n=EVIDENCE_IDS):
    items = list(items)
    return ", ".join(items[:n]) + (" +%d" % (len(items) - n) if len(items) > n else "")


# ---- role skills

def role_card_paths(skills_dir=None):
    """role id -> SKILL.md path over skills/team-*/ (id without the prefix) and the researcher and solution-architect skills."""
    base = skills_dir or os.path.join(TEAMS, "skills")
    out = {os.path.basename(os.path.dirname(f))[len(TEAM_PREFIX):]: f
           for f in sorted(glob.glob(os.path.join(base, TEAM_PREFIX + "*", "SKILL.md")))}
    for name in COMMAND_ROLES:
        f = os.path.join(base, name, "SKILL.md")
        if os.path.isfile(f):
            out[name] = f
    return out


def card_ref(paths, role):
    path = paths.get(role)
    return os.path.relpath(path, TEAMS) if path else "skills/%s%s/SKILL.md" % (TEAM_PREFIX, role)


def parse_role_skills(skills_dir=None):
    """role id -> {required: [...], conditional: [...]} from the `- **Skills:**` line of each worker and command skill."""
    out = {}
    for stem, f in sorted(role_card_paths(skills_dir).items()):
        try:
            with open(f, encoding="utf-8") as src:
                m = re.search(r"^- \*\*Skills:\*\*\s*(.+)$", src.read(), re.M)
        except OSError:
            continue
        if not m:
            continue
        line = re.sub(r"\([^)]*\)", "", m.group(1))  # parenthetical notes carry no requirement
        required, conditional = [], []
        for segment in line.split(";"):
            whole_conditional = segment.strip().lower().startswith("load ")
            for clause in segment.split(","):
                cond = whole_conditional or re.search(r"\bwhen\b|on demand|\bwith\b", clause) is not None
                for name in re.findall(r"`([^`]+)`", clause):
                    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
                        continue  # {slot} placeholders and code snippets
                    (conditional if cond else required).append(name)
        out[stem] = {"required": required, "conditional": conditional}
    return out


# ---- aggregation

def filter_sessions(data, repo=None, run=None, role=None, agent=None):
    return [s for s in data.get("sessions") or []
            if (not repo or s.get("repo") == repo) and (not run or s.get("run_id") == run)
            and (not role or s.get("role") == role) and (not agent or s.get("agent") == agent)]


def tokens_by_role(sessions):
    total = sum(s.get("total") or 0 for s in sessions)
    by = {}
    for s in sessions:
        r = by.setdefault(s.get("role"), {"role": s.get("role"), "total": 0, "sessions": set(), "mix": {}})
        r["total"] += s.get("total") or 0
        r["sessions"].add(sid(s))
        for k, v in (s.get("mix") or {}).items():
            key = "%s|%s" % (s.get("agent"), k)
            r["mix"][key] = r["mix"].get(key, 0) + v
    rows = []
    for r in sorted(by.values(), key=lambda r: -r["total"]):
        mix = sorted(r["mix"].items(), key=lambda kv: -kv[1])
        rows.append({"role": r["role"], "tokens": r["total"], "sessions": len(r["sessions"]),
                     "share": round(r["total"] / total, 4) if total else 0,
                     "mix": [{"key": k, "tokens": v} for k, v in mix if v]})
    return rows


def search_by_role(sessions):
    by = {}
    for s in sessions:
        r = by.setdefault(s.get("role"), {"role": s.get("role"), "codegraph": 0, "rg_grep": 0, "rg_symbol": 0})
        r["codegraph"] += cnt(s, "codegraph")
        r["rg_grep"] += cnt(s, "rg") + cnt(s, "grep")
        r["rg_symbol"] += cnt(s, "rg_symbol")
    rows = []
    for r in by.values():
        n = r["codegraph"] + r["rg_grep"]
        if n:
            rows.append(dict(r, codegraph_share=round(r["codegraph"] / n, 4)))
    return sorted(rows, key=lambda r: (-r["rg_symbol"], -(r["codegraph"] + r["rg_grep"])))


def skills_by_role(sessions):
    by = {}
    for s in sessions:
        for name, n in loaded_skills(s).items():
            e = by.setdefault(s.get("role"), {}).setdefault(name, {"loads": 0, "sessions": set()})
            e["loads"] += n
            e["sessions"].add(sid(s))
    return {role: sorted(({"skill": k, "loads": v["loads"], "sessions": len(v["sessions"])} for k, v in sk.items()),
                         key=lambda x: (-x["loads"], x["skill"])) for role, sk in by.items()}


def run_scope(data, repo=None, run=None, sessions=None):
    """Runs to report: the requested one, else Runs with sessions in scope (filtered by repo)."""
    runs = (data.get("orca") or {}).get("runs") or []
    if run:
        return [r for r in runs if r["id"] == run]
    active = {s.get("run_id") for s in sessions or [] if s.get("run_id")}
    return [r for r in runs if r["id"] in active and (not repo or r.get("repo") == repo)]


def fix_rounds(r):
    fixes = [t for t in r.get("tasks") or [] if (t.get("measurement") or {}).get("kind") in FIX_KINDS]
    known = {t["measurement"]["round"] for t in fixes if t["measurement"].get("round")}
    unknown = sum(1 for t in fixes if not t["measurement"].get("round"))
    causes = {}
    for t in fixes:
        c = t["measurement"].get("cause") or "unknown"
        causes[c] = causes.get(c, 0) + 1
    metric = r.get("fix_rounds")
    if metric:
        return metric["count"], causes, metric["source"] == "code-review" or (metric["source"] == "measurement" and bool(unknown))
    return len(known) + unknown, causes, bool(unknown)


def run_summary(r):
    kinds = {}
    for t in r.get("tasks") or []:
        k = (t.get("measurement") or {}).get("kind") or "unknown"
        kinds[k] = kinds.get(k, 0) + 1
    rounds, causes, estimated = fix_rounds(r)
    return {"id": r["id"], "objective": r.get("objective"), "repo": r.get("repo"), "stage": r.get("stage"),
            "tasks": len(r.get("tasks") or []), "kinds": kinds, "fix_rounds": rounds, "fix_causes": causes,
            "fix_rounds_source": (r.get("fix_rounds") or {}).get("source", "measurement"),
            "fix_rounds_estimated": estimated, "gate_wait_seconds": r.get("gate_wait_seconds"),
            "lead_seconds": r.get("lead_seconds"), "delivered": r.get("delivered", bool(r.get("delivered_at")) or r.get("stage") == "merged"),
            "worker_tokens": r.get("worker_tokens"), "orchestrator_tokens": r.get("orchestrator_tokens")}


# ---- issues

def issue(iid, severity, title, evidence, suggestion, **flt):
    return {"id": iid, "severity": severity, "title": title, "evidence": evidence, "suggestion": suggestion,
            "filter": {k: v for k, v in flt.items() if v}}


def task_index(data):
    return {t["id"]: t for r in (data.get("orca") or {}).get("runs") or [] for t in r.get("tasks") or []}


def check_top_reviewer_rereview(sessions, tasks, top_models):
    by_run = {}
    for s in sessions:
        t = tasks.get(s.get("task_id"))
        m = (t or {}).get("measurement") or {}
        if s.get("role") != "reviewer" or not t or not (
                m.get("kind") == REREVIEW_KIND or (m.get("round") or 0) > 1):
            continue
        tier = (s.get("routing") or {}).get("tier")
        if tier == "top" or (not tier and s.get("model") in top_models):
            by_run.setdefault(s.get("run_id"), []).append(s)
    out = []
    for rid, X in by_run.items():
        tok = sum(s["total"] for s in X)
        out.append(issue("top-rereview:" + rid, "high" if tok >= TOP_TIER_HIGH_TOKENS else "medium",
                         "Reviewer chạy tier top cho re-review hẹp",
                         "%d phiên reviewer, %s token trên tier top/model top (%s) trong Run %s" % (
                             len(X), fmt(tok), ids(s["id"] for s in X), rid),
                         "Re-review hẹp phải dùng tier của Builder (tối thiểu work); chỉ review đầy đủ mới dùng top (skills/team-reviewer/SKILL.md).",
                         run=rid, role="reviewer", repo=X[0].get("repo")))
    return out


def check_missing_skills(sessions, cards):
    groups = {}
    for s in sessions:
        if s.get("run_id") and s.get("role") in cards:
            groups.setdefault((s["run_id"], s["role"]), []).append(s)
    out = []
    paths = role_card_paths()
    for (rid, role), X in sorted(groups.items()):
        have = set()
        for s in X:
            have |= set(loaded_skills(s))
        missing = [k for k in cards[role]["required"] if k not in have]
        if missing:
            out.append(issue("missing-skill:%s:%s" % (rid, role), "medium",
                             "Vai %s không nạp skill bắt buộc" % role,
                             "Run %s: %d phiên %s không nạp %s (%s)" % (
                                 rid, len(X), role, ", ".join(missing), ids(s["id"] for s in X)),
                             "Nhắc trong Task spec nạp skill theo %s, hoặc sửa skill vai nếu skill không còn bắt buộc." % card_ref(paths, role),
                             run=rid, role=role, repo=X[0].get("repo")))
    return out


def check_fix_rounds(runs):
    out = []
    for r in runs:
        rounds, causes, estimated = fix_rounds(r)
        if rounds > MAX_FIX_ROUNDS:
            cs = ", ".join("%s %d" % kv for kv in sorted(causes.items()))
            out.append(issue("fix-rounds:" + r["id"], "high" if rounds >= 2 * MAX_FIX_ROUNDS else "medium",
                             "Run có hơn %d vòng sửa" % MAX_FIX_ROUNDS,
                             "Run %s: %d vòng sửa%s, nguyên nhân: %s" % (
                                 r["id"], rounds, " (ước tính, thiếu round)" if estimated else "", cs),
                             "Xem nguyên nhân chính (defect, requirements, scope, standards) và siết spec hoặc review sớm hơn.",
                             run=r["id"], repo=r.get("repo")))
    return out


def check_outliers(sessions):
    by = {}
    for s in sessions:
        if s.get("total") and s.get("role") != DIRECT_ROLE:  # direct chats have no role contract
            by.setdefault(s.get("role"), []).append(s)
    out = []
    for role, X in by.items():
        if len(X) < OUTLIER_MIN_SESSIONS:
            continue
        med = statistics.median(s["total"] for s in X)
        big = sorted((s for s in X if s["total"] > OUTLIER_FACTOR * med), key=lambda s: -s["total"])
        if not big:
            continue
        top = big[0]
        cache = round(100 * top["cr"] / top["total"]) if top.get("cr") else 0
        out.append(issue("outlier:" + str(role), "high" if top["total"] > OUTLIER_HIGH_FACTOR * med else "medium",
                         "Phiên %s tốn token bất thường" % role,
                         "%d/%d phiên > %gx trung vị %s; lớn nhất %s (%s, %.1fx), ctx_max %s, cache đọc %d%%; còn lại: %s" % (
                             len(big), len(X), OUTLIER_FACTOR, fmt(med), top["id"], fmt(top["total"]), top["total"] / med,
                             fmt(top.get("ctx_max")), cache, ids(s["id"] for s in big[1:]) or "không"),
                         "Mở phiên lớn nhất, tách phiên khi context phình hoặc giao việc nhỏ hơn.",
                         role=role))
    return out


def cnt(s, kind):
    return (s.get("search") or {}).get(kind) or 0


def check_symbol_rg(sessions):
    by = {}
    for s in sessions:
        by.setdefault((s.get("run_id") or "", s.get("role")), []).append(s)
    out = []
    for (run_id, role), X in by.items():
        n = sum(cnt(s, "rg_symbol") for s in X)
        if n < SYMBOL_RG_MIN:
            continue
        cg = sum(cnt(s, "codegraph") for s in X)
        hit = [s for s in X if cnt(s, "rg_symbol")]
        repo = next((s.get("repo") for s in hit if s.get("repo")), None)
        out.append(issue("symbol-rg:%s:%s" % (run_id or "-", role), "medium",
                         "Vai %s dùng rg tìm symbol thay vì codegraph" % role,
                         "%d lần rg/grep tìm symbol trong repo đã index, codegraph %d lần; phiên: %s" % (
                             n, cg, ids(sid(s) for s in hit)),
                         "Tra symbol bằng `codegraph explore <symbol>`, còn quan hệ gọi bằng `codegraph callers|impact <symbol>`; chỉ dùng rg cho chuỗi thường.",
                         run=run_id, role=role, repo=repo))
    return out


def same_model(selected, observed):
    """Selections may use aliases (`opus`) for the observed full name (`claude-opus-5-5`)."""
    selected, observed = selected.lower(), (observed or "").lower()
    return selected == observed or selected in observed


def check_routing(sessions):
    by = {}
    for s in sessions:
        r = s.get("routing")
        if not r:
            continue
        kind = None
        if r.get("agent") != s.get("agent") or (r.get("model") and not same_model(r["model"], s.get("model"))):
            kind = "mismatch"
        elif r.get("model") and r.get("effort") in EFFORT and s.get("effort") in EFFORT \
                and EFFORT.index(s["effort"]) > EFFORT.index(r["effort"]):
            kind = "effort"
        if kind:
            by.setdefault(s.get("run_id"), {}).setdefault(kind, []).append(s)
    out = []
    for rid, kinds in by.items():
        parts, X = [], []
        for kind, label in (("mismatch", "khác agent/model đã chọn"), ("effort", "effort cao hơn đã chọn")):
            for s in kinds.get(kind, []):
                r = s["routing"]
                parts.append("%s: chọn %s/%s/%s, thực tế %s/%s/%s (%s)" % (
                    label, r.get("agent"), r.get("model") or "?", r.get("effort") or "?",
                    s.get("agent"), s.get("model"), s.get("effort"), s["id"]))
                X.append(s)
        out.append(issue("routing:%s" % rid, "medium" if "mismatch" in kinds else "low",
                         "Phiên chạy khác routing đã chọn",
                         "Run %s, %d phiên: %s" % (rid, len(X), "; ".join(parts[:EVIDENCE_IDS])),
                         "Kiểm tra dispatch đã áp đúng agent/model/effort từ Routing của Task; ghi lại routing.jsonl khi đổi.",
                         run=rid, repo=X[0].get("repo")))
    return out


def check_gate_wait(runs):
    out = []
    for r in runs:
        lead, wait = r.get("lead_seconds"), r.get("gate_wait_seconds")
        if not lead or wait is None or lead < GATE_MIN_LEAD_SECONDS or wait <= GATE_WAIT_SHARE * lead:
            continue
        share = wait / lead
        out.append(issue("gate-wait:" + r["id"], "high" if share > GATE_WAIT_HIGH_SHARE else "medium",
                         "Chờ PO chiếm phần lớn thời gian Run",
                         "Run %s: chờ gate %s trên %s tổng (%d%%)%s" % (
                             r["id"], dur(wait), dur(lead), round(100 * share),
                             "" if r.get("delivered_at") else ", Run chưa giao"),
                         "Gom câu hỏi vào ít gate hơn và nêu rõ việc PO cần quyết; làm việc song song khi gate đang mở.",
                         run=r["id"], repo=r.get("repo")))
    return out


def find_issues(data, sessions, runs, cards=None):
    cards = parse_role_skills() if cards is None else cards
    all_s = data.get("sessions") or []
    top_models = {s["model"] for s in all_s if (s.get("routing") or {}).get("tier") == "top" and s.get("model")}
    found = (check_top_reviewer_rereview(sessions, task_index(data), top_models)
             + check_missing_skills(sessions, cards) + check_fix_rounds(runs)
             + check_outliers(sessions) + check_routing(sessions) + check_gate_wait(runs)
             + check_symbol_rg(sessions))
    return sorted(found, key=lambda i: (SEVERITY[i["severity"]], i["id"]))


# ---- reports

def feature_scope(data, repo=None, run=None):
    features = data.get("features") or {}
    rows = [f for f in features.get("runs", []) if (not repo or f["repo"] == repo)
            and (not run or run in f["run_ids"])]
    repos = {f["repo"] for f in rows}
    return dict(orca_loading=features.get("orca_loading", False), runs=rows,
                repositories={name: metrics for name, metrics in features.get("repositories", {}).items()
                              if (not repo or repo == name) and (not run or name in repos)})


def summary(data, repo=None, run=None, role=None, agent=None, cards=None):
    sessions = filter_sessions(data, repo, run, role, agent)
    # Run-level checks follow repo/run only; a role/agent filter narrows sessions, not Runs.
    runs = run_scope(data, repo, run, filter_sessions(data, repo, run))
    total = sum(s.get("total") or 0 for s in sessions)
    return {"scope": {"days": data.get("days"), "repo": repo, "run": run, "role": role, "agent": agent,
                      "generated_at": data.get("generated_at")},
            "totals": {"tokens": total, "sessions": len({sid(s) for s in sessions}),
                       "assigned_tokens": sum(s.get("total") or 0 for s in sessions if s.get("run_id")),
                       "in": sum(s.get("fin") or 0 for s in sessions), "cache_read": sum(s.get("cr") or 0 for s in sessions),
                       "cache_write": sum(s.get("cw") or 0 for s in sessions), "out": sum(s.get("out") or 0 for s in sessions)},
            "features": feature_scope(data, repo, run),
            "tokens_by_role": tokens_by_role(sessions),
            "search_by_role": search_by_role(sessions),
            "skills_by_role": skills_by_role(sessions),
            "runs": [run_summary(r) for r in runs],
            "issues": find_issues(data, sessions, runs, cards)}


def run_detail(data, rid, cards=None):
    r = next((x for x in (data.get("orca") or {}).get("runs") or [] if x["id"] == rid), None)
    if not r:
        return None
    sessions = filter_sessions(data, run=rid)
    by_task = {}
    for s in sessions:
        by_task.setdefault(s.get("task_id"), []).append(s)
    now = time.time()
    tasks = []
    for t in sorted(r.get("tasks") or [], key=lambda t: t.get("created") or 0):
        m = t.get("measurement") or {}
        X = by_task.get(t["id"], [])
        tiers = [x["tier"] for x in t.get("routing") or [] if x.get("tier")]
        start, end = t.get("started") or t.get("created"), t.get("ended") or t.get("completed")
        skills = {}
        for s in X:
            for k, n in loaded_skills(s).items():
                skills[k] = skills.get(k, 0) + n
        tasks.append({"id": t["id"], "title": t.get("title"), "role": t.get("role"), "kind": m.get("kind"),
                      "round": m.get("round"), "cause": m.get("cause"), "status": t.get("status"),
                      "agent": t.get("agent"), "model": t.get("model"), "effort": t.get("effort"),
                      "tier": tiers[-1] if tiers else None, "tokens": sum((t.get("tokens") or {}).values()),
                      "duration_seconds": (end - start) if start and end and end >= start else None,
                      "skills": skills})
    gates = [{"id": g["id"], "kind": g["kind"], "stage": g.get("stage"), "task": g.get("task"),
              "wait_seconds": ((g.get("resolved") or now) - g["created"]) if g.get("created") else None,
              "question": (g.get("question") or "")[:120]} for g in r.get("gates") or []]
    return {"run": run_summary(r), "features": feature_scope(data, run=rid), "tasks": tasks, "gates": gates,
            "issues": find_issues(data, sessions, [r], cards), "skills_window_days": data.get("days")}


# ---- markdown

def esc(v):
    return str(v if v is not None else "").replace("|", "/").replace("\n", " ").replace("\u2014", "-").replace("\u2013", "-")


def table(head, rows):
    return "\n".join(["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
                     + ["| " + " | ".join(esc(c) for c in row) + " |" for row in rows])


def issues_md(issues):
    if not issues:
        return "No issues detected."
    return "\n".join("- **[%s]** %s: %s. Suggestion: %s. Filter: `%s`" % (
        i["severity"], i["title"], i["evidence"], i["suggestion"].rstrip("."), json.dumps(i["filter"], ensure_ascii=False))
        for i in issues)


def summary_md(s):
    sc, tt = s["scope"], s["totals"]
    flt = ", ".join("%s=%s" % (k, sc[k]) for k in ("repo", "run", "role", "agent") if sc.get(k)) or "none"
    out = ["# Team dashboard summary", "",
           "Scope: last %s days, filters: %s" % (sc["days"], flt), "",
           "## Totals", "",
           "%s tokens in %d sessions (%s assigned to Runs). Input %s, cache read %s, cache write %s, output %s." % (
               fmt(tt["tokens"]), tt["sessions"], fmt(tt["assigned_tokens"]), fmt(tt["in"]), fmt(tt["cache_read"]),
               fmt(tt["cache_write"]), fmt(tt["out"])), "",
           "## Tokens by role", "",
           table(["Role", "Tokens", "Share", "Sessions", "Top agent/model/effort"],
                 [[r["role"], fmt(r["tokens"]), "%.1f%%" % (100 * r["share"]), r["sessions"],
                   ", ".join("%s %s" % (m["key"], fmt(m["tokens"])) for m in r["mix"][:2])]
                  for r in s["tokens_by_role"]]), "",
           "## Code search by role", "",
           table(["Role", "codegraph", "rg/grep", "rg_symbol", "codegraph share"],
                 [[r["role"], r["codegraph"], r["rg_grep"], r["rg_symbol"], "%.0f%%" % (100 * r["codegraph_share"])]
                  for r in s["search_by_role"]]) if s["search_by_role"] else "No code searches.", "",
           "## Skills by role", ""]
    out.append(table(["Role", "Skills (loads)"], [[role, ", ".join("%s %d" % (x["skill"], x["loads"]) for x in sk[:SKILLS_SHOWN])
                                                   + (" +%d more" % (len(sk) - SKILLS_SHOWN) if len(sk) > SKILLS_SHOWN else "")]
                                                  for role, sk in sorted(s["skills_by_role"].items())]) if s["skills_by_role"] else "No skill loads.")
    out += ["", "## Runs", ""]
    out.append(table(["Run", "Repo", "Stage", "Tasks", "Fix rounds", "Gate wait", "Lead", "Worker tok", "Orch tok", "Objective"],
                     [[r["id"], r["repo"], r["stage"], ", ".join("%s %d" % kv for kv in sorted(r["kinds"].items())),
                       r["fix_rounds"], dur(r["gate_wait_seconds"]), dur(r["lead_seconds"]), fmt(r["worker_tokens"]),
                       fmt(r["orchestrator_tokens"]), (r["objective"] or "")[:60]] for r in s["runs"]]) if s["runs"] else "No Runs in scope.")
    out += ["", "## Feature Runs", "",
            table(["Repo / branch", "Variant", "Escaped defects", "Median days", "Source"],
                  [[f["repo"] + " / " + f["branch"], f["variant"], f.get("escaped_defects"), f.get("median_days_to_surface"), f.get("source")]
                   for f in s["features"]["runs"]]), "", "## Issues (%d)" % len(s["issues"]), "", issues_md(s["issues"]), ""]
    return "\n".join(out)


def run_md(d):
    r = d["run"]
    out = ["# Run %s" % r["id"], "",
           "%s | repo %s | stage %s | lead %s | gate wait %s | worker %s tok, orchestrator %s tok | fix rounds %d" % (
               r["objective"], r["repo"], r["stage"], dur(r["lead_seconds"]), dur(r["gate_wait_seconds"]),
               fmt(r["worker_tokens"]), fmt(r["orchestrator_tokens"]), r["fix_rounds"]), "",
           "## Tasks", "",
           table(["#", "Role", "Kind", "Round", "Agent/model/effort", "Tier", "Tokens", "Duration", "Status", "Skills"],
                 [[i + 1, t["role"], t["kind"], t["round"], "%s/%s/%s" % (t["agent"] or "?", t["model"] or "?", t["effort"] or "?"), t["tier"],
                   fmt(t["tokens"]), dur(t["duration_seconds"]), t["status"],
                   ", ".join(sorted(t["skills"])) or "-"] for i, t in enumerate(d["tasks"])]),
           "", "Skills cover sessions in the last %s days only." % d["skills_window_days"], "",
           "## Gates", "",
           table(["Gate", "Kind", "Stage", "Wait", "Question"],
                 [[g["id"], g["kind"], g["stage"], dur(g["wait_seconds"]), g["question"]] for g in d["gates"]]) if d["gates"] else "No gates.",
           "", "## Issues (%d)" % len(d["issues"]), "", issues_md(d["issues"]), ""]
    return "\n".join(out)


# ---- http

_parsed = {}


def snapshot(days):
    body = snapshots.store.get(days)
    hit = _parsed.get(days)
    if not hit or hit[0] is not body:
        hit = _parsed[days] = (body, json.loads(body))
    return hit[1]


def handle(path, query):
    """(status, body bytes, content type) for /api/agent/*, or None."""
    if path not in ("/api/agent/summary", "/api/agent/run"):
        return None
    q = {k: v[0] for k, v in query.items() if v}
    try:
        days = min(max(int(q.get("days", "7")), 1), 90)
    except ValueError:
        days = 7
    try:
        data = snapshot(days)
    except RuntimeError:
        return 503, b"Dashboard data is temporarily unavailable", "text/plain"
    as_json = q.get("format") == "json"
    if path == "/api/agent/run":
        result = run_detail(data, q.get("id", ""))
        if result is None:
            return 404, b"unknown run id", "text/plain"
        render = run_md
    else:
        result = summary(data, q.get("repo"), q.get("run"), q.get("role"), q.get("agent"))
        render = summary_md
    if as_json:
        return 200, json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode(), "application/json"
    return 200, render(result).encode(), "text/markdown; charset=utf-8"
