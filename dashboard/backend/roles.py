import glob
import json
import os
import re

from .config import TEAMS

ROLE_LINE_RE = re.compile(r"^\s*role\s*:\s*(.+)$", re.I | re.M)
ROLE_FILE_RE = re.compile(r"roles/([a-z0-9-]+)\.md")
DISCUSSION_ROLE_PATTERNS = (
    ("researcher", re.compile(
        r"\blàm\s+researcher\b|\b(?:act|work)\s+as\s+(?:the\s+)?researcher\b|"
        r"^\s*role\s*:\s*research(er)?\b|bạn\s+làm\s+researcher", re.I | re.M)),
    ("solution-architect", re.compile(
        r"\blàm\s+(?:solution\s+architect(?:ure)?|SA)\b|"
        r"\b(?:act|work)\s+as\s+(?:the\s+)?solution\s+architect\b|"
        r"^\s*role\s*:\s*solution\s+architect(?:ure)?\b", re.I | re.M)),
)
DISCUSSION_READ_RE = re.compile(r"\b(?:cat|sed|head)\b[^;&|\n]*\broles/(researcher|solution-architect)\.md\b", re.I)
ROLE_ALIAS = {
    "build": "builder", "fix": "builder", "review": "reviewer", "re-review": "reviewer",
    "review+security": "reviewer", "docs": "doc-keeper", "doc": "doc-keeper",
    "design": "designer", "perf": "perf-a11y", "a11y": "perf-a11y", "close": "orchestrator",
    "product": "pm", "research": "researcher", "deliver": "delivery", "verify": "reviewer", "ux": "designer",
    "spec": "pm", "plan": "tech-lead", "arch": "tech-lead", "architect": "tech-lead", "investigate": "researcher",
    "solution": "solution-architect", "sa": "solution-architect", "solution-architect": "solution-architect",
    "arch-review": "solution-architect", "poc": "builder",
}
DIRECT_ROLE = "chat trực tiếp"  # no team role: a direct chat with the user
WORKER_ROLE = "worker"  # Orca worker whose task title names no role

def known_roles():
    names = {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(TEAMS, "roles", "*.md"))}
    if os.path.isfile(os.path.join(TEAMS, "skills", "orchestrator", "SKILL.md")):
        names.add("orchestrator")
    return sorted(names)

def norm_role(word, roles):
    w = (word or "").strip().lower()
    if w in roles:
        return w
    if w in ROLE_ALIAS:
        return ROLE_ALIAS[w]
    return None

def role_from_title(title, roles):
    """`<role>: <work>` and variants: `review + anti-ai: x`, `build-t3: x`, `pm-spec: x`, `# Task: verify x`."""
    t = re.sub(r"^[#\s]*(?:task:\s*)?", "", (title or "").strip(), flags=re.I)
    head = t.split(":", 1)[0] if ":" in t else (t.split() or [""])[0]
    for w in re.split(r"[\s+/,]+", head.lower()):
        r = norm_role(w, roles) or norm_role(re.sub(r"-\w*\d\w*$", "", w), roles) or norm_role(w.split("-")[0], roles)
        if r:
            return r
    return None

def role_from_text(text, roles):
    m = ROLE_LINE_RE.search(text or "")
    if not m:
        return None
    v = m.group(1)
    m2 = ROLE_FILE_RE.search(v)
    if m2:
        return m2.group(1)
    m3 = re.match(r"\s*([A-Za-z][\w+-]*)", v)
    return norm_role(m3.group(1), roles) if m3 else None

def discussion_role(first_text):
    text = (first_text or "")[:400]
    return next((role for role, pattern in DISCUSSION_ROLE_PATTERNS if pattern.search(text)), None)

def discussion_tool_role(name, args):
    from .parsers.common import cmd_text
    parsed = args
    if isinstance(args, str):
        try:
            parsed = json.loads(args)
        except ValueError:
            pass
    if name == "Read" and isinstance(parsed, dict):
        path = parsed.get("file_path") or parsed.get("path") or ""
        m = ROLE_FILE_RE.search(path)
        if m and m.group(1) in ("researcher", "solution-architect"):
            return m.group(1)
    m = DISCUSSION_READ_RE.search(cmd_text(args))
    return m.group(1).lower() if m else None

def note_discussion_tool(s, name, args):
    if s.get("tool_count", 0) < 5 and not s.get("discussion_read"):
        s["discussion_read"] = discussion_tool_role(name, args)
    s["tool_count"] = s.get("tool_count", 0) + 1

def assign_role(task, session):
    if task and task.get("role"):
        return task["role"], "orca"
    elif session["role_line"]:
        return session["role_line"], "role-line"
    elif session.get("dispatcher"):
        return "orchestrator", "dispatch"
    elif "orchestrator" in session.get("title", "").lower():
        return "orchestrator", "title"
    elif any(name == "orchestrator" for name, _ in session.get("skills", [])):
        return "orchestrator", "skill"
    elif not task and session.get("discussion"):
        return session["discussion"], "discussion"
    elif task:
        return WORKER_ROLE, "orca"
    return DIRECT_ROLE, None
