// The panel <-> worker contract. The HTML panel (web/panel.js) calls these by name.
export {}

declare module 'orca' {
  interface PluginRequests {
    /** Fetches the dashboard's /api/data, cuts it to what the Tasks tab reads and holds it as numbered chunks. */
    'tasks.open': { input: { days: number }; output: { id: string; chunks: number; bytes: number } }
    /** One chunk of a snapshot from tasks.open, at most about 900 KB; joined in order they are the snapshot's JSON. */
    'tasks.chunk': { input: { id: string; index: number }; output: { chunk: string } }
  }
}
