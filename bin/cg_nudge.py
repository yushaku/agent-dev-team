#!/usr/bin/env python3
"""PostToolUse hook (Claude Code, Codex): after a shell `rg`/`grep` that looks up a code symbol
in a repo indexed by codegraph (`.codegraph/` at or above cwd), add one line of context pointing
to `codegraph explore`/`callers`. Never blocks; any error exits 0 silently.

`symbol_searches(cmd)` defines what a symbol search is. The dashboard's ledger counts such searches
in `orca-plugin/ledger/session.ts` (`symbolSearch`), a TypeScript port of this definition: change both together.
"""
import json
import os
import re
import shlex
import sys

SEARCH_BINS = {"rg", "grep", "egrep"}
# Patterns (`\b` already stripped) that are a code symbol, optionally with a declaration keyword or a |-alternation of symbols.
DECL = r"(?:(?:export\s+)?(?:async\s+)?(?:function|class|def|interface|type|const|let|var|func|fn)\s+)?"
IDENT = r"[A-Za-z_$][A-Za-z0-9_$]*"
SYMBOL_RE = re.compile(r"^%s%s(?:\|%s%s)*$" % (DECL, IDENT, DECL, IDENT))
# A symbol needs a code-ish shape: camelCase, PascalCase with an inner capital, snake_case or a keyword.
SHAPE_RE = re.compile(r"[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[A-Za-z]_[A-Za-z]|^(?:function|class|def|interface|type|func|fn)\s")
FLAGS_WITH_VALUE = {"-g", "--glob", "-t", "--type", "-T", "--type-not", "-m", "--max-count", "-A", "-B", "-C",
                    "--include", "--exclude", "--exclude-dir", "-f", "--file", "--max-depth", "-M", "--max-columns"}


def _patterns(argv):
    """Search pattern(s) of one rg/grep argv (after the binary)."""
    out, i = [], 0
    while i < len(argv):
        a = argv[i]
        if a in ("-e", "--regexp") and i + 1 < len(argv):
            out.append(argv[i + 1]); i += 2; continue
        if a.startswith("--regexp="):
            out.append(a.split("=", 1)[1]); i += 1; continue
        if a in FLAGS_WITH_VALUE:
            i += 2; continue
        if a.startswith("-"):
            i += 1; continue
        if not out:
            out.append(a)
        break
    return out


def symbol_searches(cmd):
    """Symbol names looked up with rg/grep in a shell command string ([] when none)."""
    found = []
    try:
        lex = shlex.shlex((cmd or "").replace("\\b", ""), posix=True, punctuation_chars=";&|()<>")
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return found
    commands, cur = [], []
    for t in tokens:
        if t and set(t) <= set(";&|()<>"):
            commands.append(cur); cur = []
        else:
            cur.append(t)
    commands.append(cur)
    for argv in commands:
        while argv and (argv[0] in ("rtk", "command", "sudo", "git") or "=" in argv[0]):
            argv = argv[1:]
        if not argv or os.path.basename(argv[0]) not in SEARCH_BINS:
            continue
        for p in _patterns(argv[1:]):
            if SYMBOL_RE.match(p) and SHAPE_RE.search(p):
                names = re.findall(r"[A-Za-z_$][A-Za-z0-9_$]*", re.sub(DECL, "", p))
                found += names
    return found


def indexed_root(cwd, cmd):
    """Repo root with .codegraph/ for the command's directory (honours a leading `cd X &&`)."""
    m = re.match(r"\s*cd\s+(\"[^\"]+\"|'[^']+'|\S+)\s*(?:&&|;)", cmd or "")
    d = os.path.join(cwd or os.getcwd(), os.path.expanduser(m.group(1).strip("'\""))) if m else (cwd or os.getcwd())
    d = os.path.abspath(d)
    while True:
        if os.path.isdir(os.path.join(d, ".codegraph")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def main():
    try:
        ev = json.load(sys.stdin)
        ti = ev.get("tool_input") or {}
        cmd = ti.get("command") or ti.get("cmd") or ""
        if isinstance(cmd, list):
            cmd = " ".join(cmd)
        names = symbol_searches(cmd)
        if not names or not indexed_root(ev.get("cwd"), cmd):
            return
        q = " ".join(dict.fromkeys(names))[:120]
        msg = ("codegraph: this repo is indexed and `%s` is a symbol lookup. Next time use "
               "`codegraph explore \"%s\"` (definition, source and call paths) or `codegraph callers|impact <symbol>`; "
               "keep rg for literal strings, config keys and non-code files." % (q, q))
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": msg}}))
    except Exception:
        pass


if __name__ == "__main__":
    main()
