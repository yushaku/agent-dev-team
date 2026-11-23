"""Estimate escaped defects from removed lines and merge ancestry."""
import re
import statistics
from datetime import datetime, timezone
from functools import lru_cache

from .features import git

ESCAPED_DEFECT_WINDOW_DAYS = 30


def default_head(repo):
    ref = git(repo, "symbolic-ref", "refs/remotes/origin/HEAD")
    branch = ref.removeprefix("refs/remotes/origin/") if ref else None
    return git(repo, "rev-parse", "--verify", "refs/heads/" + branch) if branch else next(
        (head for name in ("main", "master") if (head := git(repo, "rev-parse", "--verify", "refs/heads/" + name))), None)


def merge_branch(subject):
    match = re.match(r"Merge branch '([^']+)'", subject)
    if match:
        return match[1]
    match = re.match(r"Merge pull request #\d+ from [^/]+/(.+)", subject)
    return match[1] if match else None


def blamed_commits(repo, sha, parent):
    names = git(repo, "diff", "-w", "-M", "-C", "--name-status", "-z", parent, sha)
    if names is None:
        return None
    fields, commits = names.split("\0"), set()
    index = 0
    while index < len(fields) and fields[index]:
        status, old = fields[index:index + 2]
        index += 2
        new = old
        if status[0] in "RC":
            new = fields[index]
            index += 1
        if status[0] == "A":
            continue
        patch = git(repo, "diff", "-w", "-M", "-C", "--no-ext-diff", "--no-color", "--unified=0", parent, sha, "--", old, new)
        if patch is None:
            return None
        for start, count in re.findall(r"^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@", patch, re.M):
            start, count = int(start), int(count) if count else 1
            if not count:
                continue
            blame = git(repo, "blame", "-w", "-M", "-C", "--line-porcelain", "-L", f"{start},{start + count - 1}", parent, "--", old)
            if blame is None:
                return None
            commits.update(re.findall(r"^([0-9a-f]{40,64}) \d+ \d+(?: \d+)?$", blame, re.M))
    return commits


@lru_cache(maxsize=32)
def repo_defects(repo, head):
    history = git(repo, "log", "--first-parent", "--reverse", "--format=%H%x09%ct%x09%P%x09%s", head)
    if history is None:
        return dict(features={}, unattributed_fix_commits=[], error="git_history_unavailable")
    owners, landed, features = {}, {}, {}
    for order, line in enumerate(history.splitlines()):
        sha, timestamp, parents, subject = line.split("\t", 3)
        parents = parents.split()
        branch = merge_branch(subject) if len(parents) > 1 else None
        introduced = git(repo, "rev-list", sha, *(["^" + parents[0]] if parents else []))
        if introduced is None:
            return dict(features={}, unattributed_fix_commits=[], error="git_ancestry_unavailable")
        for commit in introduced.splitlines():
            landed[commit] = (int(timestamp), order)
            if branch:
                owners[commit] = branch
        if branch:
            features[branch] = dict(merge_sha=sha, merged_at=int(timestamp), order=order, fix_commits=[])
    candidates = git(repo, "log", "--format=%H%x00%ct%x00%P%x00%s%x00%B%x1e", head)
    if candidates is None:
        return dict(features={}, unattributed_fix_commits=[], error="git_fixes_unavailable")
    unattributed = []
    for entry in candidates.split("\x1e"):
        if not entry.strip():
            continue
        sha, timestamp, parents, subject, body = entry.lstrip("\n").split("\0", 4)
        trailers = re.findall(r"^Fixes-feature:\s*(\S+)\s*$", body, re.M | re.I)
        if not re.match(r"^fix(?:\([^)]*\))?(?:!)?(?::|\s|$)", subject, re.I) and not trailers:
            continue
        at, order = landed[sha]
        targets, source = set(), "trailer" if trailers else "szz"
        if trailers:
            for trace in trailers:
                matches = [b for b in features if b == trace or b.rsplit("/", 1)[-1] == trace]
                if trace in features:
                    targets.add(trace)
                elif len(matches) == 1:
                    targets.update(matches)
        elif parents:
            changes = git(repo, "diff", "-w", "--stat", parents.split()[0], sha)
            if changes == "":
                continue
            blamed = blamed_commits(repo, sha, parents.split()[0])
            if blamed is None:
                return dict(features={}, unattributed_fix_commits=[], error="git_blame_unavailable")
            targets = {owners[c] for c in blamed if c in owners}
        eligible = [b for b in targets if order > features[b]["order"] and max(0, at - features[b]["merged_at"]) <= ESCAPED_DEFECT_WINDOW_DAYS * 86400]
        fix = dict(sha=sha, subject=subject, date=datetime.fromtimestamp(at, timezone.utc).isoformat(), source=source)
        for branch in eligible:
            features[branch]["fix_commits"].append(dict(fix, days_after_merge=max(0, at - features[branch]["merged_at"]) / 86400))
        # Fixes with a known feature outside the window are excluded, not unattributed.
        if not targets:
            unattributed.append(fix)
    for feature in features.values():
        feature.pop("order")
        fixes = sorted(feature["fix_commits"], key=lambda f: (f["date"], f["sha"]))
        feature.update(fix_commits=fixes, escaped_defects=len(fixes),
                       median_days_to_surface=statistics.median([f["days_after_merge"] for f in fixes]) if fixes else None,
                       source="trailer" if fixes and all(f["source"] == "trailer" for f in fixes) else "szz")
    return dict(features=features, unattributed_fix_commits=unattributed, error=None)
