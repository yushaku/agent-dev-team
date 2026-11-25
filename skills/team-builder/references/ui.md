# UI

## Direction

- Read `ui_rules.design_doc`, tokens and existing components first. Honor ticket pattern, actions, states and mobile choices; match the approved prototype/reference, otherwise neighbouring screens. Extend components and tokens instead of adding arbitrary colours/sizes.
- For a new screen or redesign, load `$AGENT_SKILLS_DIR/design-taste-frontend/SKILL.md`; app screens also load its `references/app-screens.md`. Preserve project brand/tokens and Task browser/visual-loop rules. Small component edits follow the surrounding design without choosing a new direction.
- Before coding, record one line in the Task report: who uses the screen, their main job, the reference and the visual choice serving that job. Escalate unresolved product/design choices through Orchestrator `ask`.

## Build

- Choose layout from content: tables for comparison, lists for queues, forms for input, cards for distinct objects. Match density to the work; avoid turning every section into an identical card grid or KPI row.
- Establish hierarchy through type, spacing and alignment. Use accent colour for meaningful actions/data; add gradients, shadows, oversized rounding, icon tiles or motion only when the approved design calls for them.
- Use domain-specific labels and realistic content lengths. Test empty, loading, error, long-text and populated states with synthetic fixtures. Never invent live metrics, trends or testimonials to fill the layout.
- Keep controls functional, keyboard-accessible and responsive. Preserve readable contrast, focus states and touch targets when refining appearance.

## Visual check

- For `visual loop: on`, after each UI ticket's fast check, run the app per `skills/orchestrator/references/specs.md`. Capture every `ui_viewports` entry/touched state in Orca browser; inspect the rendered result against the chosen reference.
- Fix the largest mismatch first: layout/density, typography, spacing, then detail. Check clipping, overflow, long labels and mobile action placement. Limit to two rounds; save viewport/state screenshots in `shots/` and report remaining differences.
- Without the visual loop, mark appearance unverified and leave rendered review to PO; passing tests alone do not prove visual quality.
