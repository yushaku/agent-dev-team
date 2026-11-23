import { assert, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const realFetch = globalThis.fetch
const dashboard = (res: () => Response) => {
  globalThis.fetch = (async () => res()) as typeof fetch
}

test('answers tasks.data with the trimmed dashboard snapshot', async () => {
  dashboard(() => Response.json({ generated_at: 1, rtk: {}, sessions: [{ id: 's', ctx: [1] }], orca: { runs: [] } }))
  const worker = await mountWorker(main)
  const out = (await worker.request('tasks.data', { days: 7 })) as any
  assert.deepEqual(out.sessions, [{ id: 's' }])
  assert.equal(out.rtk, undefined)
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
  globalThis.fetch = realFetch
})

test('says so when the dashboard on 4747 is down', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch
  const worker = await mountWorker(main)
  await assert.rejects(worker.request('tasks.data', { days: 7 }), /offline|127\.0\.0\.1:4747/)
  await worker.deactivate()
  globalThis.fetch = realFetch
})
