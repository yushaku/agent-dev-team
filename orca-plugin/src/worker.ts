// Answers the panel with the dashboard's data. The panel cannot reach the network, so the worker
// fetches the live Python dashboard and sends back only what the Tasks tab reads.
import type { OrcaWorkerApi } from 'orca/worker'
import { chunks, prepare } from './trim'
import { run as hostLedger, shutdown } from './ledger-host'

export const DASHBOARD = 'http://127.0.0.1:4747'

const KEEP_SNAPSHOTS = 3
/** Unique per worker lifetime, so an id from before a restart can never match a snapshot opened after it. */
const lifetime = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

async function fetchDashboard(days: number, signal: AbortSignal): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${DASHBOARD}/api/data?days=${days}`, {
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)])
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as Record<string, unknown>
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw Object.assign(new Error(`Không kết nối được dashboard tại ${DASHBOARD} (${reason}).`), { code: 'offline' })
  }
}

export default function activate(orca: OrcaWorkerApi): void {
  void hostLedger(orca as never)
  /** Snapshots held for chunked pickup (this activation only); the panel reads one right after opening it. */
  const snapshots = new Map<string, { days: number; pieces: string[] }>()
  const epoch = lifetime()
  let serial = 0
  orca.panels.handle('tasks.open', async ({ days }, { signal }) => {
    const n = Number.isInteger(days) && days > 0 && days <= 90 ? days : 7
    const { text, bytes, bodyCap } = prepare(await fetchDashboard(n, signal))
    const pieces = chunks(text)
    const id = `${epoch}.${++serial}`
    snapshots.set(id, { days: n, pieces })
    for (const old of [...snapshots.keys()].slice(0, -KEEP_SNAPSHOTS)) snapshots.delete(old)
    orca.log(`tasks.open days=${n} ${bytes} bytes in ${pieces.length} chunks, message bodies cut to ${bodyCap}`)
    return { id, days: n, chunks: pieces.length, bytes }
  })
  orca.panels.handle('tasks.chunk', async ({ id, index }) => {
    const chunk = snapshots.get(id)?.pieces[index]
    if (chunk === undefined) throw Object.assign(new Error('snapshot expired'), { code: 'expired' })
    return { id, chunk }
  })
}

export async function deactivate(): Promise<void> {
  await shutdown()
}
