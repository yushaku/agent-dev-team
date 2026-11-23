// The panel's data source: answers dash.js's fetch("/api/data?days=N") from a cached snapshot or the worker,
// and tells the status bar what happened. No DOM or Orca globals here, so scripts/source.test.mjs can run it.

/** @param {{ real: typeof fetch, base: string, ask(days: number): Promise<object>, cached(days: number): object | null,
 *  remember(days: number, data: object): void, firstDays: number, hasCharts(): boolean,
 *  ok(): void, fail(error: Error & { code?: string }, hadCharts: boolean): void }} d */
export function makeFetch(d) {
  let fromCache = d.cached(d.firstDays) ? d.firstDays : 0
  return async (input, init) => {
    const url = new URL(String(input), d.base)
    if (url.pathname !== '/api/data') return d.real(input, init)
    const days = Number(url.searchParams.get('days')) || 7
    if (fromCache === days) {
      fromCache = 0
      const data = d.cached(days)
      if (data) return { ok: true, status: 200, json: async () => data }
    }
    try {
      const data = await d.ask(days)
      d.ok()
      d.remember(days, data)
      return { ok: true, status: 200, json: async () => data }
    } catch (e) {
      d.fail(e, d.hasCharts())
      return { ok: false, status: 503, json: async () => ({}) }
    }
  }
}

/** Status bar state: an error over drawn charts keeps them; an error with nothing drawn hides the empty frames until a retry works. */
export function barView(bar, msg) {
  return {
    ok() { bar.classList.remove('error', 'empty'); bar.hidden = true; msg.textContent = '' },
    fail(text, hadCharts) { bar.classList.add('error'); bar.classList.toggle('empty', !hadCharts); bar.hidden = false; msg.textContent = text }
  }
}

/**
 * Reads one snapshot as chunks. `request(name, input)` calls the worker. The ids are unique per worker
 * lifetime, so a restart answers `expired` instead of another snapshot's data; the requested range is then
 * opened again, once. Every piece is checked against the open it came from.
 */
export function makeAsk(request) {
  return async function ask(days) {
    for (let attempt = 0; ; attempt++) {
      const open = await request('tasks.open', { days })
      if (open.days !== undefined && open.days !== days) throw new Error(`worker opened ${open.days} days, not ${days}`)
      try {
        let text = ''
        for (let index = 0; index < open.chunks; index++) {
          const reply = await request('tasks.chunk', { id: open.id, index })
          if (reply.id !== undefined && reply.id !== open.id) throw Object.assign(new Error('chunk from another snapshot'), { code: 'expired' })
          text += reply.chunk
        }
        return JSON.parse(text)
      } catch (e) {
        if (e.code === 'expired' && attempt < 2) continue // the worker restarted or moved on: open the requested range again
        throw e
      }
    }
  }
}
