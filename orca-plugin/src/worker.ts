// Answers the panel with the dashboard's data. The panel cannot reach the network, so the worker
// fetches the live Python dashboard and sends back only what the Tasks tab reads.
import type { OrcaWorkerApi } from 'orca/worker'
import { fit } from './trim'
import { run as hostLedger, shutdown } from './ledger-host'

export const DASHBOARD = 'http://127.0.0.1:4747'

export default function activate(orca: OrcaWorkerApi): void {
  void hostLedger(orca as never).catch((e) => orca.log(`ledger host failed: ${e}`))
  orca.panels.handle('tasks.data', async ({ days }, { signal }) => {
    const n = Number.isInteger(days) && days > 0 && days <= 90 ? days : 7
    let data: Record<string, unknown>
    try {
      const res = await fetch(`${DASHBOARD}/api/data?days=${n}`, {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)])
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = (await res.json()) as Record<string, unknown>
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw Object.assign(new Error(`Không kết nối được dashboard tại ${DASHBOARD} (${reason}).`), {
        code: 'offline'
      })
    }
    const { payload, bytes, bodyCap } = fit(data)
    orca.log(`tasks.data days=${n} ${bytes} bytes, message bodies cut to ${bodyCap}`)
    return payload
  })
}

export async function deactivate(): Promise<void> {
  await shutdown()
}
