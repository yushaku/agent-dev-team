import { assert, mountWorker, test } from 'orca/testing'
import * as main from './worker'

// The ledger host (real ingest, port 4748) stays off in tests.
;(globalThis as any).process.env.TEAM_DASHBOARD_NO_LEDGER = '1'

const CAP = 1_048_576
const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
const realFetch = globalThis.fetch
const dashboard = (res: () => Response) => {
  globalThis.fetch = (async () => res()) as typeof fetch
}

async function read(worker: Awaited<ReturnType<typeof mountWorker>>, days = 7) {
  const open = (await worker.request('tasks.open', { days })) as { id: string; chunks: number; bytes: number }
  assert.ok(size(open) < CAP)
  let text = ''
  for (let index = 0; index < open.chunks; index++) {
    const reply = (await worker.request('tasks.chunk', { id: open.id, index })) as { chunk: string }
    assert.ok(size(reply) < CAP, `chunk ${index} is ${size(reply)} bytes`)
    text += reply.chunk
  }
  return { open, data: JSON.parse(text) as any }
}

test('hands the trimmed dashboard snapshot over in chunks', async () => {
  dashboard(() => Response.json({ generated_at: 1, rtk: {}, sessions: [{ id: 's', ctx: [1] }], orca: { runs: [] } }))
  const worker = await mountWorker(main)
  const { data } = await read(worker)
  assert.deepEqual(data.sessions, [{ id: 's' }])
  assert.equal(data.rtk, undefined)
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
  globalThis.fetch = realFetch
})

test('a 30-day sized snapshot arrives whole, every reply under the cap', async () => {
  const sessions = Array.from({ length: 4000 }, (_, i) => ({ id: 's' + i, preview: 'ế'.repeat(160), run_id: 'r' + (i % 150) }))
  const runs = Array.from({ length: 150 }, (_, i) => ({ id: 'r' + i, tasks: [], events: Array.from({ length: 30 }, (_, j) => ({ id: `${i}-${j}`, body: '"x"'.repeat(2000) })) }))
  dashboard(() => Response.json({ generated_at: 1, days: 30, sessions, orca: { runs } }))
  const worker = await mountWorker(main)
  const { open, data } = await read(worker, 30)
  assert.ok(open.chunks > 1)
  assert.equal(data.sessions.length, 4000)
  assert.equal(data.orca.runs.length, 150)
  await worker.deactivate()
  globalThis.fetch = realFetch
})

test('an unknown or old snapshot id says expired', async () => {
  const worker = await mountWorker(main)
  await assert.rejects(worker.request('tasks.chunk', { id: 'nope', index: 0 }), /expired/)
  await worker.deactivate()
})

test('says so when the dashboard on 4747 is down', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch
  const worker = await mountWorker(main)
  await assert.rejects(worker.request('tasks.open', { days: 7 }), /offline|127\.0\.0\.1:4747/)
  await worker.deactivate()
  globalThis.fetch = realFetch
})

test('snapshot ids are unique across worker lifetimes: an old id never resolves to a newer snapshot', async () => {
  dashboard(() => Response.json({ generated_at: 1, sessions: [{ id: 'x' }], orca: { runs: [] } }))
  const first = await mountWorker(main)
  const old = (await first.request('tasks.open', { days: 7 })) as { id: string }
  await first.deactivate()
  const second = await mountWorker(main) // a restarted worker: the counter starts over
  const fresh = (await second.request('tasks.open', { days: 30 })) as { id: string; days: number }
  assert.notEqual(old.id, fresh.id)
  assert.equal(fresh.days, 30)
  await assert.rejects(second.request('tasks.chunk', { id: old.id, index: 0 }), /expired/)
  const piece = (await second.request('tasks.chunk', { id: fresh.id, index: 0 })) as { id: string }
  assert.equal(piece.id, fresh.id)
  await second.deactivate()
  globalThis.fetch = realFetch
})
