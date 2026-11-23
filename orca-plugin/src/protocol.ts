// The panel <-> worker contract. The HTML panel (dashboard-web/js/orca-panel.js) calls these by name.
export {}

declare module 'orca' {
  interface PluginRequests {
    /** A skill's document for the skill sheet; a refusal (bad name, unknown skill) carries `http_<status>` as its code. */
    'team.skill': { input: { name: string }; output: Record<string, unknown> }
    /** Fetches the dashboard's /api/data, cuts it to what the Tasks tab reads and holds it as numbered chunks. */
    'tasks.open': { input: { days: number }; output: { id: string; days: number; chunks: number; bytes: number } }
    /** One chunk of a snapshot from tasks.open (the id is unique across worker restarts; an old one answers `expired`), at most about 900 KB; joined in order they are the snapshot's JSON. */
    'tasks.chunk': { input: { id: string; index: number }; output: { id: string; chunk: string } }
  }
}
