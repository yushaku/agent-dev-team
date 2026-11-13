#!/usr/bin/env python3
"""Embed an archify diagram in a frappe doc: the diagram SVG only, no viewer.

Usage: python3 archify-embed.py <diagram.html> [--id name] > snippet.html

Input: an archify HTML artifact already passed through archify-frappe.py.
Output: one <div class="archify-embed diagram-scroll"> holding the diagram <svg>
with a scoped <style> inside it. Paste it into figure.diagram in place of
div.diagram-scroll.

- CSS: only the archify rules for classes the SVG uses, plus the archify-frappe
  overrides, with every var() resolved to the Frappe dark values. No light theme,
  no viewer, toolbar or motion CSS. Every selector is scoped to #archify-<id>.
- SVG: scripts, animation, node tooltips, focus/button roles, data-* and event
  attributes removed. Ids prefixed with <id>- (url(#), href and aria refs
  updated) so several diagrams can share a page. Root keeps role=img, title, desc.
- Size: width 100% of the frame, height auto. Wider than 1040 px at natural size,
  or narrow screens: keeps a min width and scrolls inside the wrapper.
- Deterministic; a snippet made by this script is passed through unchanged.
"""
import html
import os
import re
import sys

FRAME = 1040          # content column of frappe docs
PHONE_MIN = 560       # below this a scaled diagram gets unreadable; scroll instead
MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
SVG_TAGS = {"svg", "g", "rect", "path", "text", "tspan", "line", "polyline", "polygon",
            "circle", "ellipse", "marker", "pattern", "defs", "use", "title", "desc", "*"}
DROP_PROPS = re.compile(r"^(transition|animation|cursor|pointer-events|will-change|outline|"
                        r"user-select|-webkit-user-select|transform-box|transform-origin)")
VAR_SCOPES = {':root': 0, '[data-theme="dark"]': 1, '[data-preset="classic"]': 1,
              '[data-preset="classic"][data-theme="dark"]': 2}
MARK = "data-archify-embed"


def css_rules(css):
    """Top-level (selector, body) pairs; strings and comments aware."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    rules, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        depth, k, quote = 1, j + 1, None
        while k < n and depth:
            ch = css[k]
            if quote:
                if ch == "\\":
                    k += 1
                elif ch == quote:
                    quote = None
            elif ch in "\"'":
                quote = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            k += 1
        rules.append((css[i:j].strip(), css[j + 1:k - 1]))
        i = k
    return rules


def split_list(sel):
    return [s.strip() for s in re.split(r",(?![^\[\]()]*[\])])", sel) if s.strip()]


def decls(body):
    out = []
    for d in re.split(r";(?![^()]*\))", body):
        if ":" in d:
            prop, val = d.split(":", 1)
            out.append((prop.strip(), " ".join(val.split())))
    return out


def theme_vars(rules):
    found = []
    for order, (sel, body) in enumerate(rules):
        if sel.startswith("@"):
            continue
        ranks = [VAR_SCOPES[s] for s in split_list(sel) if s in VAR_SCOPES]
        if ranks:
            found.append((max(ranks), order, body))
    v = {}
    for _, _, body in sorted(found):
        for prop, val in decls(body):
            if prop.startswith("--"):
                v[prop] = val
    return v


def resolve(val, v, missing, depth=0):
    def sub(m):
        name, fb = m.group(1), m.group(2)
        if name in v:
            return resolve(v[name], v, missing, depth + 1)
        if fb is not None:
            return resolve(fb.strip(), v, missing, depth + 1)
        missing.add(name)
        return m.group(0)
    if depth > 10:
        return val
    return re.sub(r"var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)", sub, val)


COMPOUND = r"(?:[a-z]+|\*)?(?:\.[\w-]+)*"
SEL_OK = re.compile(rf"^{COMPOUND}(?:\s*>\s*{COMPOUND}|\s+{COMPOUND})*$")


def keep_selector(sel, classes):
    """Plain element/class selector whose classes all occur in the SVG."""
    sel = re.sub(r'^(svg)?\[data-preset="classic"\]', lambda m: m.group(1) or "", sel).strip()
    if not sel or not SEL_OK.match(sel):
        return None
    used = re.findall(r"\.([\w-]+)", sel)
    tags = re.findall(r"(?:^|[\s>])([a-z]+|\*)", sel)
    if not used or any(c not in classes for c in used) or any(t not in SVG_TAGS for t in tags):
        return None
    return sel


def build_css(rules, classes, v, scope, min_w):
    out, missing = [], set()
    for sel, body in rules:
        if sel.startswith("@"):
            continue
        sels = [s for s in (keep_selector(x, classes) for x in split_list(sel)) if s]
        if not sels:
            continue
        ds = [(p, resolve(val, v, missing)) for p, val in decls(body)
              if not p.startswith("--") and not DROP_PROPS.match(p)]
        if ds:
            out.append(", ".join(f"{scope} {s}" for s in sels) + " { "
                       + " ".join(f"{p}: {val};" for p, val in ds) + " }")
    head = [
        f"{scope} {{ display: block; max-width: 100%; overflow-x: auto; overflow-y: hidden; }}",
        f"{scope} > svg {{ display: block; width: 100%; height: auto; max-width: none; "
        f"min-width: {min_w}px; margin: 0; background: none; font-family: {MONO}; "
        f"overflow: visible; }}",
    ]
    if missing:
        print("archify-embed: unresolved vars " + ", ".join(sorted(missing)), file=sys.stderr)
    return "\n".join(head + list(dict.fromkeys(out)))


ATTR = re.compile(r'\s([\w:.-]+)\s*=\s*("[^"]*"|\'[^\']*\')')


def clean_svg(svg, prefix):
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r"<(script|style|foreignObject)\b.*?</\1>", "", svg, flags=re.S)
    svg = re.sub(r"<(animate\w*|set)\b[^>]*/>", "", svg)
    svg = re.sub(r"<(animate\w*|set)\b.*?</\1>", "", svg, flags=re.S)
    # node tooltips: <title> not directly under the root (root title/desc come first)
    root_end = svg.index(">") + 1
    body = svg[root_end:]
    keep = re.match(r"(\s*(?:<title\b.*?</title>\s*)?(?:<desc\b.*?</desc>\s*)?)", body, re.S).group(1)
    body = keep + re.sub(r"\s*<title\b.*?</title>", "", body[len(keep):], flags=re.S)
    svg = svg[:root_end] + body

    ids = sorted(set(re.findall(r'\sid="([^"]+)"', svg)), key=len, reverse=True)
    idmap = {i: f"{prefix}-{i}" for i in ids}

    root = [True]

    def fix_tag(m):
        name, attrs, close = m.group(1), m.group(2), m.group(3)
        is_root = name == "svg" and root[0]
        if is_root:
            root[0] = False
        kept = []
        for a, raw in ATTR.findall(attrs):
            val = raw[1:-1]
            low = a.lower()
            if low.startswith("data-") or low.startswith("on") or low in ("tabindex", "focusable"):
                continue
            if low == "role" and not is_root:
                continue
            if low.startswith("aria-") and low != "aria-hidden" and not is_root:
                continue
            if low == "class":
                val = " ".join(c for c in val.split() if c)
            if low == "id":
                val = idmap.get(val, val)
            elif low in ("href", "xlink:href") and val.startswith("#"):
                val = "#" + idmap.get(val[1:], val[1:])
            elif low in ("aria-labelledby", "aria-describedby"):
                val = " ".join(idmap.get(t, t) for t in val.split())
            if "url(#" in val:
                val = re.sub(r"url\(#([^)]+)\)", lambda u: f"url(#{idmap.get(u.group(1), u.group(1))})", val)
            if low == "style":
                val = "; ".join(f"{p}: {x}" for p, x in decls(val) if not DROP_PROPS.match(p))
                if not val:
                    continue
            q = "'" if '"' in val else '"'
            kept.append(f" {a}={q}{val}{q}")
        return f"<{name}{''.join(kept)}{close}>"

    svg = re.sub(r"<([a-zA-Z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'))*)\s*(/?)>",
                 fix_tag, svg)
    svg = re.sub(r">\s*\n\s*", ">\n", svg)
    return re.sub(r"\n{2,}", "\n", svg)


def embed(text, src, ident):
    m = re.search(r"<svg\b[^>]*\bviewBox=\"([^\"]+)\"[^>]*>.*?</svg>", text, re.S)
    if not m:
        raise ValueError(f"{src}: no diagram <svg viewBox> found")
    if 'id="archify-frappe"' not in text:
        print(f"archify-embed: {src} has no archify-frappe block; run archify-frappe.py first",
              file=sys.stderr)
    svg_raw = m.group(0)
    vb = [float(x) for x in m.group(1).replace(",", " ").split()]
    w, h = vb[2], vb[3]
    head = text[:m.start()]
    css = "\n".join(s for s in re.findall(r"<style\b[^>]*>(.*?)</style>", head, re.S))
    rules = css_rules(css)
    svg = clean_svg(svg_raw, ident)
    classes = {c for v in re.findall(r'\sclass="([^"]*)"', svg) for c in v.split()}
    scope = f"#archify-{ident}"
    min_w = round(w) if w > FRAME else min(round(w), PHONE_MIN)
    style = build_css(rules, classes, theme_vars(rules), scope, min_w)
    root = re.match(r"<svg\b[^>]*>", svg).group(0)
    new_root = root[:-1].rstrip("/") + f' width="{round(w)}" height="{round(h)}">'
    svg = svg.replace(root, new_root + f"\n<style>\n{style}\n</style>", 1)
    title = re.search(r"<title\b[^>]*>(.*?)</title>", svg, re.S)
    label = html.unescape(title.group(1).strip()) if title else ident
    return (f'<div class="archify-embed diagram-scroll" id="archify-{ident}" {MARK}="{ident}" '
            f'role="region" tabindex="0" aria-label="{html.escape(label, quote=True)}">\n'
            f"{svg}\n</div>\n")


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s if s[:1].isalpha() else f"d-{s}"


def main(argv):
    args, ident = [], None
    it = iter(argv)
    for a in it:
        if a == "--id":
            ident = next(it, None)
        elif a.startswith("--id="):
            ident = a[5:]
        elif a in ("-h", "--help"):
            sys.exit(__doc__)
        else:
            args.append(a)
    if len(args) != 1:
        sys.exit(__doc__)
    path = args[0]
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if MARK in text[:2000] and "<html" not in text[:2000].lower():
        sys.stdout.write(text)  # already an embed snippet
        return
    base = os.path.basename(path)
    ident = slug(ident or os.path.splitext(base)[0])
    sys.stdout.write(embed(text, base, ident))


if __name__ == "__main__":
    main(sys.argv[1:])
