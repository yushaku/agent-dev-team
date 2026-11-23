import json
import os
import re
import statistics
import subprocess
from functools import lru_cache
from pathlib import Path

from .parsers.common import loaded_skills, main_checkout


def git(repo, *args):
    try:
        result = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, timeout=2)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


@lru_cache(maxsize=4096)
def merged(repo, branch, head, default_head):
    try:
        result = subprocess.run(["git", "-C", repo, "merge-base", "--is-ancestor", head, default_head],
                                capture_output=True, timeout=2)
        return {0: True, 1: False}.get(result.returncode)
    except (OSError, subprocess.TimeoutExpired):
        return None


def delivered(repo, branch, refs=None):
    if not repo:
        return None
    refs = refs if refs is not None else {}
    if repo not in refs:
        heads = git(repo, "for-each-ref", "--format=%(refname:lstrip=2) %(objectname)", "refs/heads/") or ""
        heads = dict(line.split(" ", 1) for line in heads.splitlines())
        default = git(repo, "symbolic-ref", "refs/remotes/origin/HEAD")
        default = default.removeprefix("refs/remotes/origin/") if default else next((n for n in ("main", "master") if n in heads), None)
        refs[repo] = heads, heads.get(default)
    heads, default_head = refs[repo]
    head = heads.get(branch)
    return merged(repo, branch, head, default_head) if head and default_head else None


def feature_dir(repo, branch):
    feature = (branch or "").rsplit("/", 1)[-1]
    if not repo or feature in ("", ".", ".."):
        return None
    return Path(repo) / ".team" / feature


def report_rounds(directory):
    reports = directory / "reports" if directory else None
    if not reports or not reports.is_dir():
        return None
    return len({int(m[1]) for path in reports.glob("*-builder-r*.md")
                if (m := re.search(r"-builder-r(\d+)(?!\d)", path.name))})


def gate_findings(directory):
    try:
        return len(re.findall(r"^- Gate 2 finding:", (directory / "decisions.md").read_text(), re.M))
    except (OSError, TypeError):
        return None


def measurement_rounds(runs):
    rounds = {t["measurement"]["round"] for r in runs for t in r.get("tasks", [])
              if (t.get("measurement") or {}).get("kind") in ("fix", "re-review")
              and t["measurement"].get("round")}
    return len(rounds)


def build_features(sessions, runs):
    groups, run_map, refs = {}, {r["id"]: r for r in runs}, {}
    for s in sessions:
        branch = (s.get("branch") or "").strip()
        if branch in ("", "main", "master", "HEAD") or s["repo"] == "?":
            continue
        groups.setdefault((s["repo"], branch), []).append(s)
    features = []
    for (repo, branch), rows in groups.items():
        checkout = next((p for s in rows if (p := main_checkout(s.get("cwd")))), None)
        checkout_source = "git" if checkout else "unavailable"
        if not checkout:
            # shortcut: removed Orca worktrees resolve through the project name until stable repo IDs are available.
            candidate = os.path.expanduser("~/orca/projects/" + repo)
            checkout = candidate if os.path.isdir(candidate) else None
            if checkout:
                checkout_source = "orca_project"
        directory = feature_dir(checkout, branch)
        ids = sorted({s["run_id"] for s in rows if s.get("run_id")})
        linked = [run_map[rid] for rid in ids if rid in run_map]
        skills = {}
        for s in rows:
            for name, count in loaded_skills(s).items():
                skills[name] = skills.get(name, 0) + count
        rounds = report_rounds(directory)
        source = "reports"
        if rounds is None:
            if skills.get("code-review"):
                rounds, source = max(0, skills["code-review"] - 1), "code-review"
            else:
                rounds, source = measurement_rounds(linked), "measurement" if linked else "code-review"
        first = min((s["start"] for s in rows if s.get("start")), default=None)
        last = max((s["end"] or s["start"] for s in rows if s.get("end") or s.get("start")), default=None)
        total = sum(s["total"] for s in rows)
        orch = sum(s["total"] for s in rows if s.get("run_id") and s.get("role") == "orchestrator")
        feature = dict(id=json.dumps([repo, branch], separators=(",", ":")),
                       repo=repo, branch=branch, variant="orca" if ids else "direct", run_ids=ids,
                       first_activity=first, last_activity=last, lead_seconds=last - first if first and last else None,
                       tokens=total, orchestrator_tokens=orch if ids else None, worker_tokens=total - orch if ids else None,
                       session_count=len({(s["agent"], s.get("session_id", s["id"])) for s in rows}),
                       agents=sorted({s["agent"] for s in rows}), loaded_skills=skills,
                       fix_rounds=dict(count=rounds, source=source), gate2_findings=gate_findings(directory),
                       delivered=delivered(checkout, branch, refs))
        feature["sources"] = dict(checkout=checkout_source, tokens="session_usage", activity="session_bounds",
                                  loaded_skills="session_skill_loads_and_hooks",
                                  gate2_findings="decisions" if feature["gate2_findings"] is not None else "unavailable",
                                  delivered="local_git_ancestry")
        feature["heuristics"] = ["repo_basename_identity", "branch_last_segment"]
        if checkout_source == "orca_project":
            feature["heuristics"].append("orca_project_path")
        if source == "code-review":
            feature["heuristics"].append("code_review_loads_minus_one")
        features.append(feature)
    for r in runs:
        linked = [f for f in features if r["id"] in f["run_ids"]]
        if linked:
            r["feature_runs"] = [dict(repo=f["repo"], branch=f["branch"]) for f in linked]
            metrics = [f["fix_rounds"] for f in linked] + ([r["fix_rounds"]] if r.get("fix_rounds") else [])
            reports = [m for m in metrics if m["source"] == "reports"]
            r["fix_rounds"] = max(reports or metrics, key=lambda x: x["count"])
            if r.get("stage") == "unknown":
                states = [f["delivered"] for f in linked]
                r["delivered"] = True if all(s is True for s in states) else False if False in states else None
                if r["delivered"]:
                    r["stage"] = "merged"
    comparisons = []
    for variant in ("direct", "orca"):
        rows = [f for f in features if f["variant"] == variant]
        findings = [f["gate2_findings"] for f in rows if f["gate2_findings"] is not None]
        comparisons.append(dict(variant=variant, count=len(rows),
            median_tokens=statistics.median([f["tokens"] for f in rows]) if rows else None,
            median_fix_rounds=statistics.median([f["fix_rounds"]["count"] for f in rows]) if rows else None,
            gate2_findings=sum(findings) if findings else None, gate2_known=len(findings)))
    total = sum(s["total"] for s in sessions)
    assigned = sum(f["tokens"] for f in features)
    return dict(runs=sorted(features, key=lambda f: f["last_activity"] or 0, reverse=True), comparison=comparisons,
                attribution=dict(total=total, assigned=assigned, unassigned=total-assigned))
