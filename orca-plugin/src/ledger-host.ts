// Hosts the ledger ingest in the plugin worker: one pass now, one every 60 s, one soon after
// agent or workspace events, a status bar item, and GET /health on 127.0.0.1:4748.
//
// ledger/ is Node-typed and Orca's plugin types carry no Node typings, so its modules are loaded by a
// computed specifier (tsc does not follow it) and typed by ledger/types.ts, which needs no Node declarations.
import type { HttpApi, IngestApi, Pass, Status } from '../../ledger/types.ts'

export type { Pass, Status }
export const HEALTH_PORT = 4748
type Report = { ok: boolean; text: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; tooltip: string }
type Env = { process?: { env: Record<string, string | undefined> } }
const env = (name: string) => (globalThis as Env).process?.env[name]

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** What the status bar shows for the current state, e.g. "Ledger 12:04 ✓"; `healthError` is why /health is not being served. */
export function report(s: Status, healthError?: string): Report {
  const pass = s.lastPass
  const note = healthError ? `\n/health is down: ${healthError}` : ''
  const warn = healthError ? ' ⚠' : ''
  if (s.lastError && s.lock !== 'held') return { ok: false, text: 'Ledger ✗ not running' + warn, tone: 'danger', tooltip: `${s.lastError.split('\n')[0]}${note}` }
  if (s.lock === 'waiting' && !pass?.finishedAt) return { ok: false, text: 'Ledger waiting' + warn, tone: 'warning', tooltip: `Another host holds the ingest lock${s.lockedBy ? ` (${s.lockedBy})` : ''}${note}` }
  if (s.lock === 'waiting') return { ok: false, text: `Ledger ${clock(pass!.finishedAt)} waiting${warn}`, tone: 'warning', tooltip: `Lock held by ${s.lockedBy ?? 'another host'}${note}` }
  if (!pass) return { ok: true, text: 'Ledger starting' + warn, tone: healthError ? 'warning' : 'neutral', tooltip: `First pass running (a backfill can take a minute)${note}` }
  const bad = pass.errors.length
  return {
    ok: !bad,
    text: `Ledger ${clock(pass.finishedAt)} ${bad ? `✗ ${bad}` : '✓'}${warn}`,
    tone: bad ? 'danger' : healthError ? 'warning' : 'success',
    tooltip: (bad ? pass.errors.slice(0, 3).join('\n') : `Pass took ${pass.ms} ms (${pass.reason})`) + note
  }
}

export function health(s: Status | undefined) {
  if (!s) return { ok: false, error: 'ledger ingest is not running' }
  const pass = s.lastPass
  return {
    ok: !!pass && pass.errors.length === 0 && s.lock === 'held',
    host: s.host, node: s.node, pid: s.pid, startedAt: s.startedAt, home: s.home,
    lock: s.lock, lockedBy: s.lockedBy, running: s.running, passes: s.passes,
    lastPass: pass && { reason: pass.reason, startedAt: pass.startedAt, finishedAt: pass.finishedAt, ms: pass.ms, timings: pass.timings, errors: pass.errors.slice(0, 20), errorCount: pass.errors.length },
    counts: s.counts, error: s.lastError
  }
}

type Api = {
  log(message: string): void
  host: { call(name: string, params: unknown): Promise<unknown> }
  events: { on(event: string, handler: () => void): unknown }
}
const LEDGER = '../../ledger/'
const load = <T>(file: string): Promise<T> => import(/* @vite-ignore */ LEDGER + file) as Promise<T>

let http: { close(): Promise<void> } | undefined
let ingest: IngestApi | undefined
let startup: Promise<void> | undefined
let generation = 0

/** Tests mount the worker for the panel handler only; they must not start a real ingest or bind 4748. */
const disabled = () => env('TEAM_DASHBOARD_NO_LEDGER') === '1'

/** Starts the host. Deactivating (or activating again) while its modules still load cancels this activation. */
export function run(orca: Api): Promise<void> {
  const mine = ++generation
  const cancelled = () => mine !== generation
  const bar = (text: string, tone: Report['tone'], tooltip: string) =>
    void orca.host.call('statusBar.update', { id: 'ledger', text, tone, tooltip }).catch((e) => orca.log(`statusBar.update failed: ${e}`))
  startup = (async () => {
    if (disabled()) return
    try {
      const [ing, ht] = await Promise.all([load<IngestApi>('ingest.ts'), load<HttpApi>('http.ts')])
      if (cancelled()) return
      await ing.stop() // an earlier runner of this process may still be draining
      if (cancelled()) return
      let healthError: string | undefined
      const show = () => { const s = ing.status(); if (s) { const r = report(s, healthError); bar(r.text, r.tone, r.tooltip) } }
      ingest = ing
      ing.start({
        host: 'orca-plugin',
        onPass: (p: Pass) => orca.log(`ledger pass (${p.reason}) ${p.ms} ms, ${p.errors.length} errors${p.errors[0] ? `: ${p.errors[0]}` : ''}`),
        onState: show
      })
      http = ht.serve({ '/health': () => health(ing.status()) }, {
        port: Number(env('TEAM_DASHBOARD_HEALTH_PORT')) || HEALTH_PORT, retryMs: 5000,
        onError: (e) => { healthError = e.code ?? String(e); orca.log(`health server ${healthError}`); show() },
        onListening: () => { healthError = undefined; show() }
      })
      for (const event of ['agent.status.changed', 'workspace.created', 'workspace.removed']) orca.events.on(event, () => ing.trigger(event))
    } catch (e) {
      orca.log(`ledger host failed to start: ${e}`)
      bar('Ledger ✗ not started', 'danger', `The ledger host could not start: ${String(e).split('\n')[0]}`)
    }
  })()
  return startup
}

/** Waits for a startup in progress, then stops ingest (a pass in flight drains first) and closes the listener. */
export async function shutdown() {
  generation++
  await startup?.catch(() => {})
  const i = ingest, h = http
  ingest = http = undefined
  try { await i?.stop() } finally { await h?.close() }
}
