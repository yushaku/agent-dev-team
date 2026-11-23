// Hosts the ledger in the plugin worker: ingest (one pass now, one every 60 s, one soon after agent or
// workspace events), the dashboard API and web UI plus GET /health on 127.0.0.1:4747 (kept retrying while
// another server holds it), and a status bar item that says whether the port is bound.
//
// The modules come from the plugin's own folders (../ledger, ../dashboard-web), never from outside it. They are Node-typed and Orca's plugin types carry no Node typings, so they are
// loaded by a computed specifier (tsc does not follow it) and typed by ledger/types.ts, which needs none.
import type { ApiModule, HttpApi, IngestApi, Pass, Status } from '../ledger/types.ts'

export type { Pass, Status }
/** The dashboard's port: the API, the web UI and /health all answer here. */
export const API_PORT = 4747
type Report = { ok: boolean; text: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; tooltip: string }
type Env = { process?: { env: Record<string, string | undefined> } }
const env = (name: string) => (globalThis as Env).process?.env[name]

/** What is listening: the port when bound, or waiting because another server holds it, and failures. */
export type Net = { bound: number[]; busy: number[]; error?: string; apiError?: string }
const noNet: Net = { bound: [], busy: [] }

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

const ports = (net: Net) => {
  const bound = [...net.bound].sort().join('·')
  const busy = [...net.busy].sort().join('·')
  return bound ? ` ${bound}` : busy ? ` ${busy} busy` : ''
}
const listening = (net: Net) =>
  [net.bound.length ? `Listening on 127.0.0.1:${[...net.bound].sort().join(', ')}` : '',
   net.busy.length ? `Waiting for port ${[...net.busy].sort().join(', ')} (in use by another server; retrying)` : '',
   net.error ? `Listener error: ${net.error}` : '',
   net.apiError ? `Dashboard API not started: ${net.apiError}` : ''].filter(Boolean).map((l) => '\n' + l).join('')

/** What the status bar shows for the current state, e.g. "Ledger 12:04 ✓ 4747"; `net` says whether the port is bound. */
export function report(s: Status, net: Net = noNet): Report {
  const pass = s.lastPass
  const note = listening(net)
  const warn = net.error || net.apiError ? ' ⚠' : ''
  const where = ports(net)
  if (s.lastError && s.lock !== 'held') return { ok: false, text: 'Ledger ✗ not running' + warn, tone: 'danger', tooltip: `${s.lastError.split('\n')[0]}${note}` }
  if (s.lock === 'waiting' && !pass?.finishedAt) return { ok: false, text: 'Ledger waiting' + where + warn, tone: 'warning', tooltip: `Another host holds the ingest lock${s.lockedBy ? ` (${s.lockedBy})` : ''}${note}` }
  if (s.lock === 'waiting') return { ok: false, text: `Ledger ${clock(pass!.finishedAt)} waiting${where}${warn}`, tone: 'warning', tooltip: `Lock held by ${s.lockedBy ?? 'another host'}${note}` }
  if (!pass) return { ok: true, text: 'Ledger starting' + where + warn, tone: warn ? 'warning' : 'neutral', tooltip: `First pass running (a backfill can take a minute)${note}` }
  const bad = pass.errors.length
  return {
    ok: !bad,
    text: `Ledger ${clock(pass.finishedAt)} ${bad ? `✗ ${bad}` : '✓'}${where}${warn}`,
    tone: bad ? 'danger' : warn ? 'warning' : 'success',
    tooltip: (bad ? pass.errors.slice(0, 3).join('\n') : `Pass took ${pass.ms} ms (${pass.reason})`) + note
  }
}

export function health(s: Status | undefined, net: Net = noNet) {
  if (!s) return { ok: false, error: 'ledger ingest is not running' }
  const pass = s.lastPass
  return {
    ok: !!pass && pass.errors.length === 0 && s.lock === 'held',
    host: s.host, node: s.node, pid: s.pid, startedAt: s.startedAt, home: s.home,
    lock: s.lock, lockedBy: s.lockedBy, running: s.running, passes: s.passes,
    lastPass: pass && { reason: pass.reason, startedAt: pass.startedAt, finishedAt: pass.finishedAt, ms: pass.ms, timings: pass.timings, errors: pass.errors.slice(0, 20), errorCount: pass.errors.length },
    counts: s.counts, error: s.lastError,
    listening: { bound: net.bound, waiting: net.busy, error: net.error, apiError: net.apiError }
  }
}

type Api = {
  log(message: string): void
  host: { call(name: string, params: unknown): Promise<unknown> }
  events: { on(event: string, handler: () => void): unknown }
}
type Closing = { close(): Promise<void> }
type Handler = (req: { method?: string; headers?: Record<string, string | undefined> }, url: URL) => unknown | Promise<unknown>

const here = (path: string) => new URL(path, import.meta.url)
const importFile = (file: string): Promise<unknown> => import(/* @vite-ignore */ here('../ledger/' + file).href)
let loader: (file: string) => Promise<unknown> = importFile
/** Test hook: replaces the module loader, to make an import fail. */
export const setModuleLoader = (fn?: (file: string) => Promise<unknown>) => { loader = fn ?? importFile }
const load = <T>(file: string): Promise<T> => loader(file) as Promise<T>
const pathOf = (url: URL) => decodeURIComponent(url.pathname).replace(/\/$/, '')

let listener: Closing | undefined
let apiHandle: Closing | undefined
let apiRoutes: Record<string, Handler> | undefined
let ingest: IngestApi | undefined
let net: Net = { bound: [], busy: [] }
/** Test hook: replaces the in-process API as the source of the Tasks snapshot. */
let override: ((days: number) => Promise<Record<string, unknown>>) | undefined
/** Test hook: replaces the API's routes, to drive the route-to-panel error conversion. */
export const setApiRoutes = (routes?: Record<string, Handler>) => { apiRoutes = routes }
export const setDataSource = (fn?: (days: number) => Promise<Record<string, unknown>>) => { override = fn }

/** Why a dashboard request did not give a snapshot: the structured `loading` flag says "still loading", anything else is a failure. */
export function describeFailure(status: number, body: string): string {
  let loading = false
  try { loading = status === 503 && JSON.parse(body)?.loading === true } catch { /* plain text: a failure, not loading */ }
  if (loading) return 'HTTP 503, đang tải'
  const text = body.trim().replace(/\s+/g, ' ').slice(0, 120)
  return `HTTP ${status}${text ? `: ${text}` : ''}`
}

/** The dashboard snapshot for the Tasks panel, read from the in-process API (no network hop). */
export async function dashboardData(days: number): Promise<Record<string, unknown>> {
  if (override) return override(days)
  const route = apiRoutes?.['/api/data']
  const offline = (why: string) => Object.assign(new Error(`Dashboard API chưa sẵn sàng (${why}).`), { code: 'offline' })
  if (!route) throw offline(net.apiError ?? 'chưa khởi động')
  const res = (await route({ method: 'GET', headers: { host: '127.0.0.1' } }, new URL(`http://127.0.0.1/api/data?days=${days}`))) as Response
  if (!res.ok) throw offline(describeFailure(res.status, await res.text()))
  return (await res.json()) as Record<string, unknown>
}

/** Activation and shutdown run one after another on this chain, so neither can start while the other drains. */
let chain: Promise<void> = Promise.resolve()
let generation = 0
function enqueue(step: () => Promise<void>): Promise<void> {
  const done = chain.then(step)
  chain = done.catch(() => {}) // a failed step does not block the next one; the caller still sees it
  return done
}

/** Tests mount the worker for the panel handler only; they must not start a real ingest or bind ports. */
const disabled = () => env('TEAM_DASHBOARD_NO_LEDGER') === '1'

/**
 * Stops what a running host holds, in order: the listener, then the API's worker, then ingest (drain, release).
 * Every step is attempted even if an earlier one fails; the first failure is rethrown afterwards. Safe to call twice.
 */
async function teardown() {
  const l = listener, a = apiHandle, i = ingest
  listener = undefined; apiHandle = undefined; apiRoutes = undefined; ingest = undefined
  net = { bound: [], busy: [] }
  const failures: unknown[] = []
  for (const stop of [() => l?.close(), () => a?.close(), () => i?.stop()]) {
    try { await stop() } catch (e) { failures.push(e) }
  }
  if (failures.length) throw failures[0]
}

/**
 * Starts the host. Activations are serialized: a new one first waits for earlier steps (a shutdown included) and
 * tears down whatever they left running. Deactivating, or activating again, while modules still load cancels the
 * older activation; its event handlers go inert.
 */
export function run(orca: Api): Promise<void> {
  const mine = ++generation
  const cancelled = () => mine !== generation
  const bar = (text: string, tone: Report['tone'], tooltip: string) =>
    void orca.host.call('statusBar.update', { id: 'ledger', text, tone, tooltip }).catch((e) => orca.log(`statusBar.update failed: ${e}`))
  return enqueue(async () => {
    if (disabled()) return
    try {
      // The port comes first: a bad override must fail before anything is started.
      const raw = env('TEAM_DASHBOARD_PORT')
      const port = raw === undefined || raw === '' ? API_PORT : Number(raw)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`TEAM_DASHBOARD_PORT must be a port number, got "${raw}"`)
      // Modules first, before any resource is opened: the optional API import can fail or be slow, and a
      // deactivation that arrives meanwhile must find nothing started.
      const optional = load<ApiModule>('api.ts').then((m) => ({ m }), (e: unknown) => ({ e }))
      const [ing, ht, api] = await Promise.all([load<IngestApi>('ingest.ts'), load<HttpApi>('http.ts'), optional])
      if (cancelled()) return
      await teardown() // the previous activation's host, if it got as far as starting one
      if (cancelled()) return
      const mynet: Net = (net = { bound: [], busy: [] })
      let failed = false // a terminal listener error: the activation is being torn down, the status bar keeps saying why
      const show = () => { const s = ing.status(); if (s && !cancelled() && !failed) { const r = report(s, mynet); bar(r.text, r.tone, r.tooltip) } }
      ingest = ing
      const state = ing.start({
        host: 'orca-plugin',
        onPass: (p: Pass) => orca.log(`ledger pass (${p.reason}) ${p.ms} ms, ${p.errors.length} errors${p.errors[0] ? `: ${p.errors[0]}` : ''}`),
        onState: show
      })
      // The dashboard API is a separate concern: if its module cannot load or it cannot start, ingest and /health still run.
      let routes: Record<string, Handler> = {}
      try {
        if ('e' in api) throw api.e
        const web = pathOf(here('../dashboard-web'))
        const e = (globalThis as Env).process!.env
        e.AGENT_DASHBOARD_WEB ||= web
        e.AGENT_TEAM_HOME ||= `${env('HOME') ?? ''}/.agents/teams`
        const created = api.m.createApi(state.home)
        apiHandle = created
        routes = created.routes as Record<string, Handler>
        apiRoutes = routes
      } catch (e) {
        mynet.apiError = String(e).split('\n')[0]
        orca.log(`dashboard API not started: ${mynet.apiError}`)
      }
      const retryMs = Number(env('TEAM_DASHBOARD_RETRY_MS')) || 5000
      // The handle is kept the moment it exists, so shutdown and a failed startup can always close it.
      // While another server holds the port the listener retries (and says so in the status bar).
      listener = ht.serve({ '/health': () => health(ing.status(), mynet), ...routes }, {
        port, retryMs,
        onError: (err) => {
          const code = err.code ?? String(err)
          if (code === 'EADDRINUSE') {
            if (mynet.busy.includes(port)) return // still held: the retry is not news
            mynet.busy.push(port)
            orca.log(`listener ${port} ${code}`); show()
            return
          }
          // Anything but a busy port is terminal: tear the whole activation down through the lifecycle chain.
          mynet.error = `${port} ${code}`
          failed = true
          orca.log(`listener ${port} ${code}: tearing the host down`)
          if (!cancelled()) bar('Ledger ✗ not started', 'danger', `The dashboard listener failed on port ${port} (${code}); the ledger host was stopped.`)
          // Only this activation's host is cleaned up: when a newer activation (or a shutdown) exists, it owns the
          // cleanup (it tears down what is left before it starts), and running ours now could close its listener.
          void enqueue(async () => { if (!cancelled()) await teardown() }).catch((again) => orca.log(`teardown after the listener error failed: ${again}`))
        },
        onListening: () => { mynet.busy = mynet.busy.filter((p) => p !== port); if (!mynet.bound.includes(port)) mynet.bound.push(port); show() }
      })
      for (const event of ['agent.status.changed', 'workspace.created', 'workspace.removed']) orca.events.on(event, () => { if (!cancelled()) ing.trigger(event) })
    } catch (e) {
      orca.log(`ledger host failed to start: ${e}`)
      try { await teardown() } catch (again) { orca.log(`cleanup after the failed start also failed: ${again}`) } // nothing stays half started
      if (!cancelled()) bar('Ledger ✗ not started', 'danger', `The ledger host could not start: ${String(e).split('\n')[0]}`)
    }
  })
}

/** Deactivates: cancels an activation still loading, then (after any step ahead of it) stops the listener, the API and ingest. Overlapping calls finish in order. */
export function shutdown(): Promise<void> {
  generation++
  return enqueue(teardown)
}
