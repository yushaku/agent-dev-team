// Answers the panels (Tasks and Agents tools) with the dashboard's data. A panel cannot reach the network, so the
// worker reads the in-process dashboard API (ledger-host.ts) and sends back only what the two views read, in chunks.
import type { OrcaWorkerApi } from 'orca/worker'
import { chunks, prepare, REPLY_LIMIT } from './trim'
import { dashboardData, run as hostLedger, shutdown, skillDoc } from './ledger-host'

const KEEP_SNAPSHOTS = 3
/** Unique per worker lifetime, so an id from before a restart can never match a snapshot opened after it. */
const lifetime = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export default function activate(orca: OrcaWorkerApi): void {
  void hostLedger(orca as never)
  /** Snapshots held for chunked pickup (this activation only); the panel reads one right after opening it. */
  const snapshots = new Map<string, { days: number; pieces: string[] }>()
  const epoch = lifetime()
  let serial = 0
  orca.panels.handle('tasks.open', async ({ days }) => {
    const n = Number.isInteger(days) && days > 0 && days <= 90 ? days : 7
    const { text, bytes, bodyCap } = prepare(await dashboardData(n))
    const pieces = chunks(text)
    const id = `${epoch}.${++serial}`
    snapshots.set(id, { days: n, pieces })
    for (const old of [...snapshots.keys()].slice(0, -KEEP_SNAPSHOTS)) snapshots.delete(old)
    orca.log(`tasks.open days=${n} ${bytes} bytes in ${pieces.length} chunks, message bodies cut to ${bodyCap}`)
    return { id, days: n, chunks: pieces.length, bytes }
  })
  orca.panels.handle('team.skill', async ({ name }) => {
    const doc = await skillDoc(String(name ?? ''))
    // One reply may not pass 1 MiB: say so specifically instead of letting the bridge fail it generically.
    const size = new TextEncoder().encode(JSON.stringify({ output: doc })).length
    if (size > REPLY_LIMIT) throw Object.assign(new Error(`Tài liệu của skill quá lớn để mở trong panel (${size} byte, tối đa ${REPLY_LIMIT}). Mở trên trình duyệt.`), { code: 'too_large' })
    return doc
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
