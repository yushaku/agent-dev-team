import glob
import json
import os
import threading

from . import config
from .config import CACHE_FILE, CLAUDE_GLOB, CODEX_GLOB, COPILOT_GLOB, PARSER_VERSION
from .parsers.claude import parse_claude
from .parsers.codex import parse_codex
from .parsers.copilot import parse_copilot

lock = threading.Lock()
cache = {"version": config.PARSER_VERSION, "files": {}, "dispatch": {}}
cache_dirty = False

def load_files():
    """Parse changed files only; returns list of parsed session dicts."""
    global cache_dirty
    files = cache["files"]
    seen = set()
    out = []
    for pattern, parser in ((CLAUDE_GLOB, parse_claude), (CODEX_GLOB, parse_codex), (COPILOT_GLOB, parse_copilot)):
        for path in glob.glob(pattern, recursive=True):
            try:
                st = os.stat(path)
            except OSError:
                continue
            seen.add(path)
            ent = files.get(path)
            if not ent or ent["size"] != st.st_size or ent["mtime"] != st.st_mtime:
                try:
                    ent = {"size": st.st_size, "mtime": st.st_mtime, "v": parser(path)}
                except OSError:
                    continue
                files[path] = ent
                cache_dirty = True
            out.append(ent["v"])
    for gone in set(files) - seen:
        del files[gone]
        cache_dirty = True
    return out

def save_cache():
    global cache_dirty
    if not cache_dirty:
        return
    tmp = CACHE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cache, f, separators=(",", ":"))
    os.replace(tmp, CACHE_FILE)
    cache_dirty = False

def load_cache():
    global cache
    try:
        with open(CACHE_FILE) as f:
            c = json.load(f)
        if c.get("version") == PARSER_VERSION:
            cache = c
            cache.setdefault("dispatch", {})
    except (OSError, ValueError):
        pass
