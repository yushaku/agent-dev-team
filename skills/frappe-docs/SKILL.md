---
name: frappe-docs
description: "Use when writing a system doc or diagram. Fills the Frappe tabbed HTML template; every diagram goes through archify."
---

# Frappe docs

## System docs router

- Copy `assets/template.html` for every system doc; use one topic per tab.
- Diagrams: see Diagrams. Use the `archify` skill.
- For plan, rollout and migration tabs, keep every source commitment, owner, dependency and order; separate decisions, assumptions and open questions. Use Frappe components, not custom styling.

## Build contract

- Copy `assets/template.html` next to the target, rename it and fill it; do not start from a blank file.
- Deliver one self-contained offline `.html` with inline CSS and JS, no CDN, web fonts or external images.
- Keep template CSS and JS unchanged; add content, not styles.
- Do not invent colours, font sizes, spacing, radii or shadows; use template tokens only.
- Delete unused example tabs and components; leave no placeholder copy.
- Verify at 1280px and 390px: tabs work, no console errors and no page-level horizontal scroll.

## Token use

- `overlay0` is never text. `overlay1` and `overlay2` are archify-only.
- Never put `subtext0` or accent text on `surface0` below 18px.
- Use one meaning per colour across the doc; within a diagram, a colour means its tier only.
- Unused colours: `sapphire`, `teal`. Reserved colours: `maroon`, `flamingo`, `rosewater`.
- Use only weights 400 and 600; no italics for emphasis.
- Use one h1 for the doc title in the top bar. Each tab starts with h2; sections use h3; do not skip heading levels.
- Headings use sentence case. Put identifiers, paths, env vars and endpoints in `code`.
- Use `gap` on flex/grid; do not set margins on components.

## Template components

- Callout: `.callout` plus `info`, `warn`, `risk` or `decision`; one bold label and one or two sentences.
- Table: inside `.table-wrap`, with a `subtext0` header and at most 6 columns.
- Code: `figure.code` with a `subtext0` filename caption and `pre` on crust.
- Key-value list: `dl.kv`, with `dt` in `subtext0` and `dd` in `text`.
- Status chip: `.chip` plus `ok`, `warn`, `risk`, `info`, `decision` or `neutral`; include a text label.
- Diagram frame: `figure.diagram` with the `archify-embed.py` snippet, `ul.legend`, figcaption and `details.diagram-text`; optionally link to the standalone file beneath it.
- Steps: `ol.steps`, one actor and action per step.
- Decision card: `article.decision` with id, title, chip, Context, Decision and Consequences.
- Parallel cards: `.grid` of `.card` for 2 to 4 items.

## Diagrams

- Make every diagram with archify; never hand-draw SVG, use another diagram tool or an inline renderer.
- Choose type by question: `architecture` for components and calls, `sequence` for one scenario in time, `workflow` for a process with branches and owners, `dataflow` for pipelines or lineage, `lifecycle` for states and retries. With no branches and fewer than 6 steps, use `ol.steps`.
- Node type sets tier colour: `frontend` client, `cloud` and `security` edge, `backend` service, `messagebus` async, `database` data, `external` external. Use the same type for a component in every diagram.
- Omit `meta.visual_preset` (only `classic` gets the Frappe pass); set `meta.locale` to the document's language (`en` by default); keep `<subject>.<type>.json` beside the doc.
- Pipeline (`A=~/.agents/skills/archify`, `F=~/.agents/skills/frappe-docs`): `node $A/bin/archify.mjs deliver <type> <spec> <subject>.html --quality showcase` (archify 3.x: `finalize`), then `python3 $F/scripts/archify-frappe.py <subject>.html`, then `node $A/bin/archify.mjs check <subject>.html` must exit 0, then `python3 $F/scripts/archify-embed.py <subject>.html > <subject>.embed.html` in scratch. Re-run all steps after every deliver; re-rendering drops the Frappe pass.
- Before placing nodes or running deliver, read `references/archify-layout.md` for grid, width budget, CLI and `sources` rules.
- Markdown image (README, GitHub): `python3 $F/scripts/archify-svg.py <subject>.html > <subject>.svg` after the check; rerun it with every render.
- Default to embedding. Paste the `archify-embed.py` snippet into the frame in place of `div.diagram-scroll`, unedited; it holds only SVG and scoped Frappe dark CSS, no viewer, toolbar, scripts or motion, with ids prefixed per diagram and width 100%, scrolling inside the wrapper when wider than the frame.
- For several diagrams on one page, use a distinct `--id <name>` for each; default is the file name. Never paste the same snippet twice.
- Never hand-edit the snippet; change the spec, rerun the pipeline and re-embed.
- A standalone archify file is optional, only when readers need pan, zoom, search, relationship tracing, views or presentation. Keep it beside the doc and add `<p class="muted"><a href="<subject>.html">Open interactive version</a>: one short clause on what to explore.</p>` below the frame, labelled in the doc language.
- Never use the archify viewer export or an iframe to embed.
- Every frame has a `ul.legend` with only shown tiers and line styles, a figcaption naming the question it answers, and `details.diagram-text` listing every node and edge.
- Split when archify validation asks or above about 12 primary nodes; use one diagram per question.
- Opening archify output in a browser is the PO's job unless asked.

## Content

- Every tab opens with a 2 to 3 line `p.lead`; prefer bullets over prose and keep paragraphs to 3 sentences max.
- No emoji or decorative icons; name real components, owners and numbers.

## Layout

- Use 4 to 8 tabs in this default order: Overview, Context, Components, Data, Flows, Decisions, Risks, Glossary; Overview is first.
- `#tab-id` opens a tab; `#heading-id` opens its tab and scrolls to the heading.
- Arrow Left/Right, Home and End move between tabs; remember the last tab per file.
- The tab bar scrolls horizontally; without JS and in print, render every panel.
- The sticky top bar contains the doc title, one status chip and the updated date; the tab bar sits below it.

## Accessibility

- Focus rings on interactive elements; ARIA `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls` and roving `tabindex`; reduced motion disables transitions and smooth scroll.
- Set `lang` and one h1; use `header`, `nav` and `main` landmarks.
- Text tokens on base, mantle and crust pass AA; meaning is never by colour alone.

## Surfaces

- Separate by space first, tone second, hairline last; no shadows, gradients or blur.
- Never combine border, background and shadow; do not nest bordered boxes.
- Tables have no outer box, vertical lines or zebra stripes; callouts get a left rule.
- Diagram nodes use a full tier-colour border.

## Typography

- Prose max 70ch; table numbers use `tabular-nums`; card titles use fs-4 and weight 600.
