// Hosts the ledger ingest in the plugin worker: one pass now, one every 60 s, one soon after
// agent or workspace events, a status bar item, and GET /health on 127.0.0.1:4748.
// ledger/ is Node-typed and Orca's plugin types carry no Node typings, so it is loaded by a computed
// specifier (tsc does not follow it) and typed by the minimal shapes below.
export type Pass = { reason: string; startedAt: string; finishedAt: string; ms: number; timings: Record<string, number>; errors: string[] }
export type Status = {
  host: string; home: string; pid: number; node: string; startedAt: string
  lock: 'held' | 'waiting' | 'stopped'; lockedBy?: string
  running: boolean; passes: number; lastPass?: Pass; lastError?: string
  counts?: { sources: Record<string, number>; blobs: number; bytes: { ledger: number; archive: number } }
}
type Ingest = {
  start(o: { host: string; onPass(p: Pass): void; onState(s: Status): void }): Status
  stop(): Promise<void>
  status(): Status | undefined
  trigger(reason: string): void
}
type Http = { serve(routes: Record<string, () => unknown>, o: { port: number; retryMs: number; onError(e: Error): void }): { close(): Promise<void> } }
const LEDGER = '../../ledger/'
const load = <T>(file: string): Promise<T> => import(/* @vite-ignore */ LEDGER + file) as Promise<T>

export const HEALTH_PORT = 4748
type Report = { ok: boolean; text: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; tooltip: string }

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** What the status bar shows for the current state, e.g. "Ledger 12:04 ✓". */
export function report(s: Status): Report {
  const pass = s.lastPass
  if (s.lock === 'waiting' && !pass?.finishedAt) return { ok: false, text: 'Ledger waiting', tone: 'warning', tooltip: `Another host holds the ingest lock${s.lockedBy ? ` (${s.lockedBy})` : ''}` }
  if (s.lock === 'waiting') return { ok: false, text: `Ledger ${clock(pass!.finishedAt)} waiting`, tone: 'warning', tooltip: `Lock held by ${s.lockedBy ?? 'another host'}` }
  if (!pass) return { ok: true, text: 'Ledger starting', tone: 'neutral', tooltip: 'First pass running (a backfill can take a minute)' }
  const bad = pass.errors.length
  return {
    ok: !bad,
    text: `Ledger ${clock(pass.finishedAt)} ${bad ? `✗ ${bad}` : '✓'}`,
    tone: bad ? 'danger' : 'success',
    tooltip: bad ? pass.errors.slice(0, 3).join('\n') : `Pass took ${pass.ms} ms (${pass.reason})`
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
let http: { close(): Promise<void> } | undefined
let ingest: Ingest | undefined

/** Tests mount the worker for the panel handler only; they must not start a real ingest or bind 4748. */
const disabled = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.TEAM_DASHBOARD_NO_LEDGER === '1'

export async function run(orca: Api) {
  if (disabled()) return
  const [{ start, trigger, status }, { serve }] = await Promise.all([load<Ingest>('ingest.ts').then((m) => (ingest = m)), load<Http>('http.ts')])
  const show = (s: Status) => {
    const r = report(s)
    void orca.host.call('statusBar.update', { id: 'ledger', text: r.text, tone: r.tone, tooltip: r.tooltip }).catch((e) => orca.log(`statusBar.update failed: ${e}`))
  }
  start({
    host: 'orca-plugin',
    onPass: (p: Pass) => orca.log(`ledger pass (${p.reason}) ${p.ms} ms, ${p.errors.length} errors${p.errors[0] ? `: ${p.errors[0]}` : ''}`),
    onState: show
  })
  http = serve({ '/health': () => health(status()) }, {
    port: HEALTH_PORT, retryMs: 5000,
    onError: (e) => orca.log(`health server ${(e as Error & { code?: string }).code ?? e}`)
  })
  for (const event of ['agent.status.changed', 'workspace.created', 'workspace.removed']) orca.events.on(event, () => trigger(event))
}

export async function shutdown() {
  await ingest?.stop()
  await http?.close()
  http = undefined
}
