---
name: team-designer
description: "Use only when an Orchestrator Task assigns the Designer role or the user runs /team-designer. Flow and 2 or 3 clickable HTML mockups for the PO to choose from."
---

# UX / UI Designer

- **Runs on:** tier work.
- **Skills:** `{design}`; throwaway mockups as self-contained HTML, built with real project tokens and components.

## Steps
1. Read `ui_rules` (tokens, components, `DESIGN.md`, bans) and the closest existing screens in the running app.
2. Flow: screens, states and transitions for every flow in the spec (empty, loading, error, success, undo where it applies), one short list or diagram; reviewed before any visual work.
3. Options: 2 or 3 clickable HTML mockups that differ in layout or hierarchy (not only colour), at the config's `ui_viewports`; one screenshot per option and viewport (`skills/orchestrator/references/specs.md` working rules), taken once.

## Rules
- **Look:** Builders do not pick it; the PO makes the visual choice.
- **No loop:** no capture-and-fix loop; the PO judges the look at G-UI.
- **Writes:** scratch only (`.team/<feature>/design/`: `flow.md`, `option-a.html`..., screenshots). Lasting decisions become tokens or components in code, or a line in `DESIGN.md`.

## Done when
- The PO picked one option at G-UI (or gate off: the Orchestrator picked, one-line reason).
- The chosen mockup plus screenshots are linked in every UI Builder Task spec.

## Report
`skills/orchestrator/references/specs.md` "Report".
