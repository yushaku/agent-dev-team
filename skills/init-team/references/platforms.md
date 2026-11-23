# Starting values by platform

Read only when initializing a project. Write the selected values into `.team/config.yaml`; that config then owns them. Other platforms use empty slots.

- **web**
  - `design`: [design-taste-frontend] (UI prototype and build Tasks)
  - `build.ui`: [frontend-ui-engineering]; React/Next.js: add vercel-react-best-practices
  - `build.core`: [database-schema-designer, security-and-hardening]
  - `perf`: [browser-testing-with-devtools, frontend-ui-engineering] (DevTools MCP for perf traces only; the Orca browser records none)
  - `perf_metrics`: "LCP, INP, CLS, bundle size, axe findings"
  - `ui_screenshots`: true
  - `ui_viewports`: ["desktop 1280x800", "mobile 390x844", "mobile dark"]
- **apple** (iOS, iPadOS, macOS)
  - `security`: [security-and-hardening]
  - `build.ui`: the project's own SwiftUI skill (`skills.project`)
  - `perf_metrics`: "launch time, main-thread hangs, memory, scroll hitches (Instruments)"
  - `ui_screenshots`: false unless the project allows simulator or device capture
  - `ui_viewports`: ["iPhone 16", "iPhone 16 dark", "Mac window"] (mockups only)
  - `commands.serial`: true; `flow.max_concurrent_agents`: low (xcodebuild shares DerivedData, each new worktree is a cold build; prefer one Builder at a time)
