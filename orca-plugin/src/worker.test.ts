import { assert, mountWorker, test } from 'orca/testing'
import * as main from './worker'
import { setApiRoutes, setDataSource } from './ledger-host'

// The ledger host (real ingest, port 4747) stays off in tests.
process.env.TEAM_DASHBOARD_NO_LEDGER = '1'

/** The fields of a snapshot these tests read. */
type Snapshot = { sessions: unknown[]; rtk: unknown; skills_installed: unknown; features: Record<string, unknown>; orca: { runs: unknown[] } }
const CAP = 1_048_576
const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
/** The Tasks snapshot comes from the in-process API; tests stand in for it. */
const dashboard = (res: () => Response) => setDataSource(async () => (await res().json()) as Record<string, unknown>)

async function read(worker: Awaited<ReturnType<typeof mountWorker>>, days = 7) {
  const open = (await worker.request('tasks.open', { days })) as { id: string; chunks: number; bytes: number }
  assert.ok(size(open) < CAP)
  let text = ''
  for (let index = 0; index < open.chunks; index++) {
    const reply = (await worker.request('tasks.chunk', { id: open.id, index })) as { chunk: string }
    assert.ok(size(reply) < CAP, `chunk ${index} is ${size(reply)} bytes`)
    text += reply.chunk
  }
  return { open, data: JSON.parse(text) as Snapshot }
}

test('hands the trimmed dashboard snapshot over in chunks', async () => {
  dashboard(() =>
    Response.json({
      generated_at: 1,
      rtk: { available: true },
      skills_installed: ['tdd'],
      features: { big: 1 },
      sessions: [{ id: 's', ctx: [1] }],
      orca: { runs: [] },
    }),
  )
  const worker = await mountWorker(main)
  const { data } = await read(worker)
  assert.deepEqual(data.sessions, [{ id: 's' }])
  assert.deepEqual(data.rtk, { available: true }, 'the Agents tools view reads rtk and the installed skills')
  assert.deepEqual(data.skills_installed, ['tdd'])
  assert.equal(data.features.big, undefined, 'a key the panels do not read is still cut')
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
  setDataSource()
})

test('a 30-day sized snapshot arrives whole, every reply under the cap', async () => {
  const sessions = Array.from({ length: 4000 }, (_, i) => ({ id: 's' + i, preview: 'ế'.repeat(160), run_id: 'r' + (i % 150) }))
  const runs = Array.from({ length: 150 }, (_, i) => ({
    id: 'r' + i,
    tasks: [],
    events: Array.from({ length: 30 }, (_, j) => ({ id: `${i}-${j}`, body: '"x"'.repeat(2000) })),
  }))
  dashboard(() => Response.json({ generated_at: 1, days: 30, sessions, orca: { runs } }))
  const worker = await mountWorker(main)
  const { open, data } = await read(worker, 30)
  assert.ok(open.chunks > 1)
  assert.equal(data.sessions.length, 4000)
  assert.equal(data.orca.runs.length, 150)
  await worker.deactivate()
  setDataSource()
})

test('an unknown or old snapshot id says expired', async () => {
  const worker = await mountWorker(main)
  await assert.rejects(worker.request('tasks.chunk', { id: 'nope', index: 0 }), /expired/)
  await worker.deactivate()
})

test('says so when the dashboard on 4747 is down', async () => {
  setDataSource(async () => {
    throw Object.assign(new Error('Dashboard API chưa sẵn sàng (HTTP 503, đang tải).'), { code: 'offline' })
  })
  const worker = await mountWorker(main)
  await assert.rejects(worker.request('tasks.open', { days: 7 }), /offline|chưa sẵn sàng/)
  await worker.deactivate()
  setDataSource()
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
  setDataSource()
})

/** The two 503 answers of the API, driven through the real route-to-panel conversion (dashboardData then tasks.open). */
test('a loading API and a failing API give the panel different messages', async () => {
  const route = (res: () => Response) => ({ '/api/data': async () => res() })
  const worker = await mountWorker(main)
  try {
    setApiRoutes(route(() => new Response(JSON.stringify({ loading: true }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    await assert.rejects(
      worker.request('tasks.open', { days: 7 }),
      (e: unknown) => /đang tải/.test(String((e as Error).message)) && !/temporarily unavailable/.test(String((e as Error).message)),
    )
    setApiRoutes(route(() => new Response('Dashboard data is temporarily unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    await assert.rejects(
      worker.request('tasks.open', { days: 7 }),
      (e: unknown) =>
        /HTTP 503: Dashboard data is temporarily unavailable/.test(String((e as Error).message)) && !/đang tải/.test(String((e as Error).message)),
    )
    setApiRoutes(route(() => new Response('Dashboard request failed', { status: 500 })))
    await assert.rejects(worker.request('tasks.open', { days: 7 }), /HTTP 500: Dashboard request failed/)
    setApiRoutes(route(() => Response.json({ generated_at: 1, sessions: [], orca: { runs: [] } })))
    assert.equal(((await worker.request('tasks.open', { days: 7 })) as { chunks: number }).chunks, 1)
  } finally {
    setApiRoutes()
    await worker.deactivate()
  }
})

test('the skill sheet reads a skill document through the worker, and a refusal keeps its HTTP status', async () => {
  const doc = { name: 'team-builder', body: '# Builder', origin: 'own' }
  const worker = await mountWorker(main)
  try {
    setApiRoutes({
      '/api/team/skill': async (_req, url) =>
        url.searchParams.get('name') === 'team-builder' ? Response.json(doc) : new Response('bad name', { status: 400 }),
    })
    assert.deepEqual(await worker.request('team.skill', { name: 'team-builder' }), doc)
    await assert.rejects(
      worker.request('team.skill', { name: '..' }),
      (e: unknown) => /bad name/.test(String((e as Error).message)) && (e as { code?: string }).code === 'http_400',
    )
    setApiRoutes()
    await assert.rejects(worker.request('team.skill', { name: 'team-builder' }), /chưa sẵn sàng/)
  } finally {
    setApiRoutes()
    await worker.deactivate()
  }
})

test('a skill document over the reply limit is a specific error; one under it goes through', async () => {
  const worker = await mountWorker(main)
  try {
    const doc = (size: number) => ({ name: 'big-skill', body: 'ế'.repeat(size), origin: 'own' }) // 3 bytes per character
    setApiRoutes({ '/api/team/skill': async () => Response.json(doc(400_000)) }) // about 1.2 MB of UTF-8
    await assert.rejects(worker.request('team.skill', { name: 'big-skill' }), (e: unknown) => {
      const error = e as { code?: string; message: string }
      return error.code === 'too_large' && /quá lớn/.test(error.message) && /900000/.test(error.message)
    })
    setApiRoutes({ '/api/team/skill': async () => Response.json(doc(200_000)) }) // about 600 KB
    const ok = (await worker.request('team.skill', { name: 'big-skill' })) as { body: string }
    assert.equal(ok.body.length, 200_000)
    assert.ok(size({ output: ok }) < 1_048_576)
  } finally {
    setApiRoutes()
    await worker.deactivate()
  }
})
