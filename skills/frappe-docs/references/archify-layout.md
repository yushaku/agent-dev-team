# Archify layout and delivery rules

- `deliver <type> <spec> <out.html>` takes positional arguments only; an unknown option exits without writing, so grep the changed label in the output after every deliver. `--repo-root` works for `architecture` only.
- Component `sources` need `meta.repository` (public GitHub URL plus 40-hex revision); for a private repo omit `sources` and name code paths in the doc.
- Lay nodes on a few fixed rows and columns, main path on the middle row left to right.
- Put externals in their own right column; never place a boundary-wrapped node there, since a boundary draws the bounding box of its wraps and swallows its neighbours. Validation does not catch it; screenshot after every deliver.
- When two edges leave the same side of a hub, move one target to another side instead of adding `via` points.
- Keep the bottom row short; a lone node there adds a row of height.
- Keep the viewBox about 1200px wide (about 150px nodes, 40 to 60px gaps); widen a node before shortening a sublabel; give a labelled gap more width than its label.
- Keep `meta.title` under about 30 characters so it stays on one line.
- Without Chrome for `visual-check`, measure containment over CDP `Emulation.setDeviceMetricsOverride` at 1440x900, 1600x1000, 1920x1080, 2048x1320 and report only the sizes viewed.
- Name diagram files by subject without a project prefix; after a rename grep the repo for old links.
- One language per artifact; never swap labels at runtime. A translated spec is validated on its own, since label widths change.
