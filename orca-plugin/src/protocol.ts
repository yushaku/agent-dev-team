// The panel <-> worker contract. The HTML panel (web/panel.js) calls these by name.
export {}

declare module 'orca' {
  interface PluginRequests {
    /** The dashboard's /api/data snapshot, cut down to what the Tasks tab reads. */
    'tasks.data': { input: { days: number }; output: Record<string, unknown> }
  }
}
