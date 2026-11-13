"""Read-only team endpoints for the dashboard server (Python 3.9 stdlib only).

Everything is parsed live from the team root and the skills dir on each request;
nothing is generated or written. Expensive parts (diagram embeds, Orca skill bodies,
skill search text) are cached in memory by mtime.

GET /api/team/index            roles, skills, diagrams, config keys, scenarios
GET /api/team/file?path=<rel>  raw .md/.yaml/.yml/.json under the team root (not dashboard/)
GET /api/team/skill?name=<n>   SKILL.md body + references/ file names (skills dir, symlinks
                               followed), else `orca skills get <n>`, else "not in shared hub"
GET /api/team/diagram?name=<n> diagram SVG snippet from diagrams/<n>.html via archify-embed.py
GET /api/team/search?q=<words> skill names whose name, description or body has every word
"""
import glob
import importlib.util
import json
import os
import re
import subprocess
import threading
import time

from .config import SKILLS_DIR, SKILL_LOCK, TEAMS

HOME = os.path.expanduser("~")
HERMES_SKILLS = os.path.join(HOME, ".hermes", "skills")
DIAGRAMS = os.path.join(TEAMS, "diagrams")
EMBED_SCRIPT = os.path.join(SKILLS_DIR, "frappe-docs", "scripts", "archify-embed.py")
SCENARIOS = os.path.join(SKILLS_DIR, "archify", "recipes", "scenarios.mjs")
FILE_EXT = (".md", ".yaml", ".yml", ".json")
EXCLUDE_DIRS = ("dashboard",)
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$")
ORCA_TTL = 600

_lock = threading.Lock()
_cache = {"embed": {}, "orca_list": (0, set()), "orca_body": {}, "search": {}, "embed_mod": (None, None)}


def tilde(p):
    return p.replace(HOME, "~", 1) if p.startswith(HOME + os.sep) else p


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------- paths
def team_path(rel):
    """Whitelisted absolute path for a team file, or raise. Rejects traversal and other roots."""
    if not rel or "\x00" in rel or rel.startswith(("/", "~")) or "\\" in rel:
        raise BadRequest("bad path")
    parts = rel.split("/")
    if any(p in ("", ".", "..") or p.startswith(".") for p in parts):
        raise BadRequest("bad path")
    if parts[0] in EXCLUDE_DIRS or not rel.endswith(FILE_EXT):
        raise BadRequest("path not allowed")
    full = os.path.realpath(os.path.join(TEAMS, rel))
    if not full.startswith(TEAMS + os.sep):
        raise BadRequest("path not allowed")
    if not os.path.isfile(full):
        raise NotFound(rel)
    return full


def team_files():
    out = []
    for root, dirs, files in os.walk(TEAMS):
        rel_root = os.path.relpath(root, TEAMS)
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and not (rel_root == "." and d in EXCLUDE_DIRS))
        for f in sorted(files):
            if f.endswith(FILE_EXT) and not f.startswith("."):
                out.append(os.path.normpath(os.path.join(rel_root, f)))
    return out


# ---------------------------------------------------------------- skills
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


def skill_text(name):
    """Lower-cased searchable text, cached by mtime."""
    p = hub_skill_file(name)
    if p:
        mt = os.stat(p).st_mtime
        ent = _cache["search"].get(name)
        if ent and ent[0] == mt:
            return ent[1]
        txt = re.sub(r"\s+", " ", read(p)).lower()
        _cache["search"][name] = (mt, txt)
        return txt
    if name in orca_list():
        return re.sub(r"\s+", " ", orca_body(name) or "").lower()
    return name.lower()


def search(q, names):
    words = [w for w in re.split(r"\s+", (q or "").strip().lower()) if w]
    if not words:
        return names
    return [n for n in names if all(w in skill_text(n) for w in words)]


# ---------------------------------------------------------------- roles
FIELD_RE = re.compile(r"^- \*\*(.+?)\*\*\s*(.*)$")
TICK_RE = re.compile(r"`([^`]+)`")
SKILL_TOKEN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SLOT_TOKEN = re.compile(r"^\{([a-z.]+)\}$")


def parse_fields(text):
    """Top-level `- **Label:** value` bullets, in order; repeated labels keep the first."""
    fields = []
    for line in text.splitlines():
        m = FIELD_RE.match(line)
        if m:
            label = m.group(1).rstrip(":").strip()
            val = m.group(2).strip()
            if m.group(1).endswith(":") is False and val.startswith(":"):
                val = val[1:].strip()
            fields.append([label, val])
    return fields


def skills_in_card(text, known):
    """Skills line tokens (names and {slots}), then any backticked known skill name elsewhere."""
    names, slots = [], []
    for line in text.splitlines():
        m = FIELD_RE.match(line)
        if m and m.group(1).rstrip(":").strip().lower() == "skills":
            for t in TICK_RE.findall(m.group(2)):
                s = SLOT_TOKEN.match(t)
                if s:
                    if s.group(1) not in slots:
                        slots.append(s.group(1))
                elif SKILL_TOKEN.match(t) and t not in names:
                    names.append(t)
    for m in re.finditer(r"`([a-z0-9][a-z0-9-]*)`\s+(?:skill|checklist)\b", text):
        if m.group(1) in known and m.group(1) not in names:
            names.append(m.group(1))
    return names, slots


def parse_role(path, known, rid=None, rel=None):
    text = read(path)
    rid = rid or os.path.basename(path)[:-3]
    h1 = re.search(r"^# (.+)$", text, re.M)
    fields = parse_fields(text)
    runs = next((v for k, v in fields if k.lower() == "runs on"), "")
    pick = {k.lower(): v for k, v in reversed(fields)}
    summary = next((pick[k] for k in ("mission", "does", "trigger", "writes") if pick.get(k)), "")
    tier = re.search(r"tier (top|work|fast)", runs)
    names, slots = skills_in_card(text, known)
    return {"id": rid, "title": h1.group(1).strip() if h1 else rid, "file": rel or "roles/%s.md" % rid,
            "runs_on": runs, "summary": summary, "tier": tier.group(1) if tier else None,
            "fields": [k for k, _ in fields], "skills": names, "slots": slots}


def split_comment(s):
    q = None
    for i, ch in enumerate(s):
        if q:
            if ch == q:
                q = None
        elif ch in "\"'":
            q = ch
        elif ch == "#" and (i == 0 or s[i - 1] in " \t"):
            return s[:i].rstrip(), s[i + 1:].strip()
    return s.rstrip(), ""


def yaml_list(v):
    v = v.strip()
    if not (v.startswith("[") and v.endswith("]")):
        return None
    inner = v[1:-1].strip()
    if not inner:
        return []
    out = []
    for part in re.findall(r'"[^"]*"|\'[^\']*\'|[^,]+', inner):
        part = part.strip()
        if part and part != ",":
            out.append(part.strip("\"'"))
    return out


def config_keys(text):
    """Key table from the ```yaml block in config.md: dotted key, example value, comment."""
    m = re.search(r"```yaml\n(.*?)```", text, re.S)
    if not m:
        return [], ""
    rows, stack = [], []
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        body, comment = split_comment(line.strip())
        if not body:  # comment-only line continues the previous key
            if rows and comment:
                rows[-1]["comment"] = (rows[-1]["comment"] + " " + comment).strip()
            continue
        li = re.match(r"^-\s*(.*)$", body)
        if li:
            if rows:
                rows[-1]["value"] = (rows[-1]["value"] + " " if rows[-1]["value"] else "") + "- " + li.group(1)
                if comment:
                    rows[-1]["comment"] = (rows[-1]["comment"] + " " + comment).strip()
            continue
        km = re.match(r"^([\w.]+):\s*(.*)$", body)
        if not km:
            continue
        while stack and stack[-1][0] >= indent:
            stack.pop()
        key = ".".join([s[1] for s in stack] + [km.group(1)])
        val = km.group(2)
        rows.append({"key": key, "value": val, "comment": comment, "parent": not val})
        if not val:
            stack.append((indent, km.group(1)))
    # parents with children only matter through their children unless they carry a comment
    keys = {r["key"] for r in rows}
    out = [r for r in rows if not (r["parent"] and any(k.startswith(r["key"] + ".") for k in keys) and not r["comment"])]
    return out, m.group(1)


# ---------------------------------------------------------------- diagrams
NODE_TIER = {"frontend": "client", "cloud": "edge", "security": "edge", "backend": "service",
             "messagebus": "async", "database": "data", "external": "external"}


def diagram_info(spec_path):
    d = json.loads(read(spec_path))
    base = os.path.basename(spec_path)
    name = base.split(".")[0]
    html_path = os.path.join(DIAGRAMS, name + ".html")
    meta = d.get("meta") or {}
    entries = (meta.get("legend") or {}).get("entries") or {}
    kind = d.get("diagram_type")
    nodes = d.get("components") or d.get("nodes") or d.get("participants") or []
    edges = d.get("connections") or d.get("edges") or d.get("messages") or []
    label = {n.get("id"): n.get("label") or n.get("id") for n in nodes}
    used = []
    for n in nodes:
        t = n.get("type")
        if t and t not in used:
            used.append(t)
    legend = [{"kind": "node", "type": t, "tier": NODE_TIER.get(t, "service"),
               "label": (entries.get(t) or {}).get("label") or t} for t in used]
    variants = []
    for e in edges:
        v = e.get("variant") or "default"
        if v not in variants:
            variants.append(v)
    for v in variants:
        if v in entries and v not in NODE_TIER:
            legend.append({"kind": "edge", "variant": v, "label": entries[v].get("label") or v})
    text = []
    groups = d.get("boundaries") or []
    in_group = set()
    for g in groups:
        members = [label.get(i, i) for i in g.get("wraps") or []]
        in_group.update(g.get("wraps") or [])
        text.append("%s: %s." % (g.get("label") or "Group", ", ".join(members)))
    lanes = d.get("lanes") or []
    if lanes:
        for ln in lanes:
            ns = [n for n in nodes if n.get("lane") == ln.get("id")]
            ns.sort(key=lambda n: n.get("col") or 0)
            text.append("%s: %s." % (ln.get("label"), ", ".join(
                (n.get("label") or "") + (" (%s)" % n["sublabel"] if n.get("sublabel") else "") for n in ns)))
    else:
        for n in nodes:
            if n.get("id") not in in_group:
                text.append("%s%s." % (n.get("label") or n.get("id"),
                                       " (%s)" % n["sublabel"] if n.get("sublabel") else ""))
    for seg in d.get("segments") or []:
        if seg.get("label"):
            text.append("Phase: %s." % seg["label"])
    links = []
    for e in edges:
        a, b = label.get(e.get("from"), e.get("from")), label.get(e.get("to"), e.get("to"))
        links.append("%s to %s%s" % (a, b, ": " + e["label"] if e.get("label") else ""))
    try:
        stale = os.stat(spec_path).st_mtime > os.stat(html_path).st_mtime
        has_html = True
    except OSError:
        stale, has_html = False, False
    return {"name": name, "type": kind, "title": meta.get("title") or name, "spec": "diagrams/" + base,
            "html": has_html, "stale": stale, "legend": legend, "text": text, "links": links}


def embed_module():
    mt = os.stat(EMBED_SCRIPT).st_mtime
    cached_mt, mod = _cache["embed_mod"]
    if mod is None or cached_mt != mt:
        spec = importlib.util.spec_from_file_location("archify_embed", EMBED_SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _cache["embed_mod"] = (mt, mod)
    return mod, mt


def diagram_embed(name):
    if not NAME_RE.match(name or "") or "." in name:
        raise BadRequest("bad name")
    path = os.path.join(DIAGRAMS, name + ".html")
    if not os.path.isfile(path):
        raise NotFound(name)
    with _lock:
        mod, smt = embed_module()
        key = (os.stat(path).st_mtime, smt)
        ent = _cache["embed"].get(name)
        if ent and ent[0] == key:
            return ent[1]
        text = read(path)
        snippet = mod.embed(text, os.path.basename(path), mod.slug(name))
        _cache["embed"][name] = (key, snippet)
        return snippet


# ---------------------------------------------------------------- scenarios (archify recipes)
def scenarios():
    try:
        src = read(SCENARIOS)
    except OSError:
        return []
    out = []
    starts = [m.start() for m in re.finditer(r"\{\s*\n\s*id: '", src)]
    for i, s in enumerate(starts):
        chunk = src[s:starts[i + 1] if i + 1 < len(starts) else len(src)]
        idm = re.search(r"id: '([^']+)', type: '([^']+)'", chunk)
        en = re.search(r"\n\s*en: \{\s*\n(.*?)\n\s*\},", chunk, re.S)
        if not idm or not en:
            continue
        rec = {"id": idm.group(1), "type": idm.group(2)}
        for k in ("title", "question", "summary", "useWhen", "avoidWhen"):
            m = re.search(r"\b%s: '((?:[^'\\]|\\.)*)'" % k, en.group(1))
            if m:
                rec[k] = m.group(1).replace("\\'", "'")
        out.append(rec)
    return out


# ---------------------------------------------------------------- index
def index():
    files = team_files()
    hermes = hermes_skill_names()
    orca_names = orca_list()
    hub = sorted(d for d in os.listdir(SKILLS_DIR) if os.path.isfile(os.path.join(SKILLS_DIR, d, "SKILL.md")))
    known = set(hub) | set(hermes) | orca_names
    roles = [parse_role(p, known) for p in sorted(glob.glob(os.path.join(TEAMS, "roles", "*.md")))]
    # the Orchestrator is a skill, not a worker card
    orch = os.path.join(TEAMS, "skills", "orchestrator", "SKILL.md")
    if os.path.isfile(orch):
        roles.insert(0, parse_role(orch, known, "orchestrator", "skills/orchestrator/SKILL.md"))
    cfg = read(os.path.join(TEAMS, "config.md"))
    sm = re.search(r"^- Slots: (.+)$", cfg, re.M)
    slot_names = TICK_RE.findall(sm.group(1).split(". ")[0]) if sm else []
    keys, yaml_src = config_keys(cfg)
    # skills: role core skills only
    lock = skill_lock()
    uses = {}
    for r in roles:
        for n in r["skills"]:
            uses.setdefault(n, set()).add(r["id"])
    skills = []
    for n in sorted(uses):
        origin, source = skill_origin(n, lock, orca_names, hermes)
        desc, refs = "", []
        p = hub_skill_file(n)
        if p:
            desc = front_matter(read(p))[0].get("description", "")
            rd = os.path.join(os.path.dirname(p), "references")
            if os.path.isdir(rd):
                refs = sorted(f for f in os.listdir(rd) if not f.startswith("."))
        skills.append({"name": n, "description": desc, "origin": origin, "source": source, "refs": refs,
                       "roles": sorted(uses[n])})
    diagrams = {}
    for sp in sorted(glob.glob(os.path.join(DIAGRAMS, "*.json"))):
        if sp.endswith(".visual-check.json"):
            continue
        try:
            info = diagram_info(sp)
            diagrams[info["name"]] = info
        except (OSError, ValueError, KeyError, TypeError):
            continue
    kept = re.search(r"^- Kept diagrams[^\n]*$", read(os.path.join(TEAMS, "docs-policy.md")), re.M)
    return {"generated_at": time.time(), "files": files, "roles": roles,
            "slots": slot_names, "skills": skills, "hub": hub, "diagrams": diagrams,
            "config_keys": keys, "config_yaml": yaml_src, "scenarios": scenarios(),
            "kept_line": kept.group(0) if kept else "", "team_home": tilde(TEAMS), "skills_dir": tilde(SKILLS_DIR)}


# ---------------------------------------------------------------- http glue
def handle(path, qs):
    """(status, body bytes, content type) for /api/team/* paths, or None if not ours."""
    def q(k):
        return (qs.get(k) or [""])[0]
    try:
        if path == "/api/team/index":
            return 200, json.dumps(index(), separators=(",", ":")).encode(), "application/json"
        if path == "/api/team/file":
            full = team_path(q("path"))
            with open(full, "rb") as f:
                return 200, f.read(), "text/plain; charset=utf-8"
        if path == "/api/team/skill":
            return 200, json.dumps(skill_doc(q("name"))).encode(), "application/json"
        if path == "/api/team/diagram":
            return 200, diagram_embed(q("name")).encode(), "text/html; charset=utf-8"
        if path == "/api/team/search":
            names = [n for n in q("names").split(",") if NAME_RE.match(n)]
            return 200, json.dumps(search(q("q"), names)).encode(), "application/json"
    except BadRequest as e:
        return 400, str(e).encode(), "text/plain; charset=utf-8"
    except NotFound:
        return 404, b"not found", "text/plain; charset=utf-8"
    except (OSError, ValueError) as e:
        return 500, ("error: %s" % type(e).__name__).encode(), "text/plain; charset=utf-8"
    return None
