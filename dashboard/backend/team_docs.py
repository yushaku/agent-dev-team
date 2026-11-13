"""Skill side panel endpoint for the dashboard server (Python 3.9 stdlib only).

GET /api/team/skill?name=<n>   SKILL.md body + references/ file names (skills dir, symlinks
                               followed), else `orca skills get <n>`, else "not in shared hub"
Read on each request; the Orca skill list and bodies are cached in memory for 10 minutes.
"""
import glob
import json
import os
import re
import subprocess
import time

from .config import SKILLS_DIR, SKILL_LOCK, TEAMS

HOME = os.path.expanduser("~")
HERMES_SKILLS = os.path.join(HOME, ".hermes", "skills")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$")
ORCA_TTL = 600

_cache = {"orca_list": (0, set()), "orca_body": {}}


def tilde(p):
    return p.replace(HOME, "~", 1) if p.startswith(HOME + os.sep) else p


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()




def front_matter(text):
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if mm:
            v = mm.group(2).strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            meta[mm.group(1)] = v
    return meta, text[m.end():]


def hub_skill_file(name):
    if not NAME_RE.match(name or ""):
        raise BadRequest("bad name")
    p = os.path.join(SKILLS_DIR, name, "SKILL.md")
    return p if os.path.isfile(p) else None


def hermes_skill_names():
    out = {}
    for p in glob.glob(os.path.join(HERMES_SKILLS, "**", "SKILL.md"), recursive=True):
        out.setdefault(os.path.basename(os.path.dirname(p)), p)
    return out


def orca_list():
    ts, names = _cache["orca_list"]
    if time.time() - ts < ORCA_TTL:
        return names
    names = set()
    try:
        r = subprocess.run(["orca", "skills", "list"], capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            names = {m.group(1) for m in re.finditer(r"^([a-z0-9][a-z0-9-]*):", r.stdout, re.M)}
    except (OSError, subprocess.SubprocessError):
        pass
    _cache["orca_list"] = (time.time(), names)
    return names


def orca_body(name):
    ent = _cache["orca_body"].get(name)
    if ent and time.time() - ent[0] < ORCA_TTL:
        return ent[1]
    body = None
    try:
        r = subprocess.run(["orca", "skills", "get", name], capture_output=True, text=True, timeout=15)
        if r.returncode == 0 and r.stdout.strip():
            body = r.stdout
    except (OSError, subprocess.SubprocessError):
        pass
    _cache["orca_body"][name] = (time.time(), body)
    return body


def skill_lock():
    try:
        return json.loads(read(SKILL_LOCK)).get("skills") or {}
    except (OSError, ValueError):
        return {}


def skill_origin(name, lock, orca_names, hermes):
    """origin: own | dl | orca | missing; plus a short source note."""
    p = hub_skill_file(name)
    if p:
        real = os.path.realpath(os.path.dirname(p))
        if real.startswith(os.path.join(TEAMS, "skills") + os.sep):
            return "own", "đội tự viết"
        if name in lock:
            return "dl", lock[name].get("source") or "skill-lock"
        d = real
        root = os.path.dirname(os.path.realpath(SKILLS_DIR))
        while d.startswith(root + os.sep):
            if os.path.isdir(os.path.join(d, ".git")):
                return "dl", os.path.basename(d) + " (git clone)"
            d = os.path.dirname(d)
        if name in orca_names:
            return "dl", "Orca"
        return "dl", "không rõ nguồn"
    if name in orca_names:
        return "orca", "orca skills get"
    return "missing", ("chỉ ở Hermes" if name in hermes else "không tìm thấy")


def skill_doc(name):
    """Body for the side panel, read on demand."""
    lock = skill_lock()
    hermes = hermes_skill_names()
    orca_names = orca_list()
    origin, source = skill_origin(name, lock, orca_names, hermes)
    out = {"name": name, "origin": origin, "source": source, "body": None, "refs": [], "path": None}
    p = hub_skill_file(name)
    if p:
        text = read(p)
        meta, body = front_matter(text)
        out.update(body=body, description=meta.get("description", ""), path=tilde(os.path.join(SKILLS_DIR, name, "SKILL.md")))
        rd = os.path.join(os.path.dirname(p), "references")
        if os.path.isdir(rd):
            out["refs"] = sorted(f for f in os.listdir(rd) if not f.startswith("."))
    elif origin == "orca":
        body = orca_body(name)
        if body:
            meta, b = front_matter(body)
            out.update(body=b, description=meta.get("description", ""), path="orca skills get %s" % name)
    elif name in hermes:
        out["path"] = tilde(hermes[name])
    return out


# ---------------------------------------------------------------- http glue
def handle(path, qs):
    """(status, body bytes, content type) for /api/team/skill, or None if not ours."""
    if path != "/api/team/skill":
        return None
    try:
        name = (qs.get("name") or [""])[0]
        return 200, json.dumps(skill_doc(name)).encode(), "application/json"
    except BadRequest as e:
        return 400, str(e).encode(), "text/plain; charset=utf-8"
    except NotFound:
        return 404, b"not found", "text/plain; charset=utf-8"
    except (OSError, ValueError) as e:
        return 500, ("error: %s" % type(e).__name__).encode(), "text/plain; charset=utf-8"
