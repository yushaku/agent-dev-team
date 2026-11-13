#!/usr/bin/env python3
"""Frappe pass for archify output: recolour to frappe-docs tokens and tiers.

Usage: python3 archify-frappe.py <diagram.html | exported.svg> [...]

HTML (after every archify `deliver`; a re-render drops the pass):
- Overrides the `classic` preset variables: Frappe for dark, Latte for the light toggle.
- Node kinds map to frappe-docs tiers; cards get the 55% tier border on base.
- Async (dashed) edges use the async tier, main-path edges text, boundaries dashed overlay1.
- Lavender only for viewer UI accents (active buttons, focus).
- Opens in dark unless the URL or the reader's saved toggle says otherwise.
SVG (exported from the archify viewer): drops the light blocks so it stays Frappe.
Idempotent: strips its own block and the legacy apply-catppuccin.py blocks first.
"""
import re
import sys

FRAPPE = dict(
    text="#c6d0f5", subtext1="#b5bfe2", subtext0="#a5adce", overlay2="#949cbb",
    overlay1="#838ba7", surface1="#51576d", surface0="#414559", base="#303446",
    mantle="#292c3c", crust="#232634", lavender="#babbf1", sky="#99d1db",
    blue="#8caaee", green="#a6d189", mauve="#ca9ee6", pink="#f4b8e4", peach="#ef9f76")
LATTE = dict(
    text="#4c4f69", subtext1="#5c5f77", subtext0="#6c6f85", overlay2="#7c7f93",
    overlay1="#8c8fa1", surface1="#bcc0cc", surface0="#ccd0da", base="#eff1f5",
    mantle="#e6e9ef", crust="#dce0e8", lavender="#7287fd", sky="#04a5e5",
    blue="#1e66f5", green="#40a02b", mauve="#8839ef", pink="#ea76cb", peach="#fe640b")
# frappe-docs tiers: client sky, edge blue, service green, async mauve, data pink, external peach
TIER = dict(client="sky", edge="blue", service="green", async_="mauve", data="pink", external="peach")
KIND = dict(frontend="client", backend="service", database="data", messagebus="async_",
            external="external", cloud="edge", security="edge")
ID = "archify-frappe"
SEL = '[data-preset="classic"][data-theme="{}"]'  # div-matchable: export probes use a div


def mix(fg, bg, p):
    a, b = fg.lstrip("#"), bg.lstrip("#")
    return "#" + "".join(
        f"{round(int(a[i:i + 2], 16) * p + int(b[i:i + 2], 16) * (1 - p)):02x}" for i in (0, 2, 4))


def theme(mode, c):
    v = {
        "bg": c["base"], "grid": c["mantle"], "text": c["text"], "text-muted": c["subtext0"],
        "text-dim": c["subtext0"], "text-faint": c["subtext0"], "panel": c["mantle"],
        "panel-border": c["surface1"], "lane-fill": c["mantle"], "lane-stroke": c["overlay1"],
        "arrow": c["overlay2"], "arrow-emphasis": c["lavender"], "mask": c["mantle"],
        "toolbar-bg": c["mantle"], "toolbar-border": c["surface1"], "toolbar-text": c["text"],
        "toolbar-hover": c["surface0"], "toolbar-menu-bg": c["mantle"],
        "frappe-async": c[TIER["async_"]],
    }
    for kind, tier in KIND.items():
        hue = c[TIER[tier]]
        v[f"{kind}-fill"] = c["base"]
        v[f"{kind}-stroke"] = hue
        v[f"frappe-card-{kind}"] = mix(hue, c["base"], 0.55)
    body = "\n  ".join(f"--{k}: {val};" for k, val in v.items())
    return f"{SEL.format(mode)} {{\n  {body}\n}}"


RULES = "\n".join(
    [f'[data-preset="classic"] rect.c-{k} {{ stroke: var(--frappe-card-{k}); }}' for k in KIND]
    + ['[data-preset="classic"] .a-dashed { stroke: var(--frappe-async); }',
       '[data-preset="classic"] .m-dashed { fill: var(--frappe-async); }',
       '[data-preset="classic"] .a-emphasis { stroke: var(--text); }',
       '[data-preset="classic"] .m-emphasis { fill: var(--text); }',
       '[data-preset="classic"] .c-region { fill: none; stroke: var(--lane-stroke); }',
       '[data-preset="classic"] text.boundary-label { fill: var(--text-muted); }'])
BLOCK = (f'<style id="{ID}">\n' + theme("dark", FRAPPE) + "\n" + theme("light", LATTE)
         + "\n" + RULES + "\n</style>")
OS_THEME = "window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'"
OS_LIVE = "apply(e.matches ? 'light' : 'dark');"


def html_pass(text):
    text = re.sub(r'\s*<style id="(archify-frappe|catppuccin-theme|lang-switch-style)">.*?</style>',
                  "", text, flags=re.S)
    text = re.sub(r'\s*<nav class="lang-switch" id="lang-switch".*?</nav>', "", text, flags=re.S)
    text = text.replace(OS_THEME, "'dark'").replace(OS_LIVE, "apply('dark');")
    text = re.sub(r'(<text data-boundary-label=""[^>]*?class=")(?![^"]*boundary-label)([^"]*)"',
                  r'\1\2 boundary-label"', text)
    if "</head>" not in text:
        raise ValueError("no </head>; not an archify HTML artifact")
    return text.replace("</head>", BLOCK + "\n</head>", 1)


def svg_pass(text):
    text = re.sub(r'@media \(prefers-color-scheme: light\) \{ :root, svg \{[^{}]*\} \}\n?', "", text)
    return re.sub(r'svg\[data-theme="light"\] \{[^{}]*\}\n?', "", text)


def main(paths):
    if not paths:
        sys.exit(__doc__)
    for path in paths:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        out = svg_pass(text) if path.lower().endswith(".svg") else html_pass(text)
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
        print("frappe", path)


if __name__ == "__main__":
    main(sys.argv[1:])
