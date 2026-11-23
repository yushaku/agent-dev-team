# UI

- **UI:** follow `ui_rules` (existing components first, tokens only, no hardcoded colours or sizes). Match the chosen mockup; with none, match neighbouring screens.
- **Visual loop:** only when the Task spec says `visual loop: on`. Run the app per the spec's working rules (`skills/orchestrator/references/specs.md`); per UI slice, after its fast check, open the screen in the Orca browser, capture every `ui_viewports` entry and touched state, compare with the mockup or neighbouring screens, fix. Max 2 rounds, then report remaining differences. Otherwise the PO checks the UI after delivery.
- **Done when (visual loop ran):** screenshots per viewport and state are in `shots/`.
