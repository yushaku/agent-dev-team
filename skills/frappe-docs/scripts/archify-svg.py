#!/usr/bin/env python3
"""Standalone SVG from an archify render, for markdown (README) images.

Usage: archify-svg.py <subject>.html > <subject>.svg
Reuses archify-embed.py output: unscopes its CSS, adds xmlns and a base background
so the dark Frappe diagram stays readable on light pages.
"""
import os, re, subprocess, sys

BASE = "#303446"


def main(path):
    embed = os.path.join(os.path.dirname(os.path.abspath(__file__)), "archify-embed.py")
    html = subprocess.run([sys.executable, embed, path], check=True, capture_output=True, text=True).stdout
    m = re.search(r'<div[^>]*\bid="(archify-[^"]+)"', html)
    svg = re.search(r"<svg\b.*</svg>", html, re.S)
    if not (m and svg):
        sys.exit("no archify svg in " + path)
    scope, out = "#" + m.group(1), svg.group(0)
    out = out.replace(scope + " > svg", "svg").replace(scope + " svg ", "svg ").replace(scope + " ", "")
    out = re.sub(r"^\s*" + re.escape(scope) + r"\s*\{[^}]*\}\s*$", "", out, flags=re.M)
    out = re.sub(r"min-width:\s*\d+px;\s*", "", out)
    vbm = re.search(r'viewBox="([\d.\s-]+)"', out)
    if not vbm:
        sys.exit("no viewBox in " + path)
    vb = vbm.group(1).split()
    bg = '<rect x="%s" y="%s" width="%s" height="%s" rx="12" fill="%s"/>' % (vb[0], vb[1], vb[2], vb[3], BASE)
    out = re.sub(r"<svg\b", '<svg xmlns="http://www.w3.org/2000/svg"', out, count=1)
    out = re.sub(r"(</style>)", r"\1" + bg, out, count=1)
    sys.stdout.write('<?xml version="1.0" encoding="UTF-8"?>\n' + out + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
