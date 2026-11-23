import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barView, makeFetch } from '../dashboard-web/js/orca-source.js'

const fakeBar = () => {
  const classes = new Set()
  return { hidden: true, classList: { add: (c) => classes.add(c), remove: (...c) => c.forEach((x) => classes.delete(x)), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) } }
}
const setup = (ask, cache = {}) => {
  const bar = fakeBar(), msg = { textContent: '' }, view = barView(bar, msg)
  let drawn = false
  const fetchLike = makeFetch({
    real: async () => 'real', base: 'http://127.0.0.1:4747', ask, cached: (d) => cache[d] ?? null, remember: (d, v) => { cache[d] = v }, firstDays: 7,
    hasCharts: () => drawn, ok: () => view.ok(), fail: (e, had) => view.fail(e.message, had)
  })
  return { bar, msg, fetchLike, draw: () => { drawn = true } }
}
const down = Object.assign(new Error('offline'), { code: 'offline' })

test('cold failure hides the empty chart frames, a successful retry shows them again', async () => {
  let up = false
  const { bar, msg, fetchLike } = setup(async () => { if (!up) throw down; return { sessions: [] } })
  const first = await fetchLike('/api/data?days=7')
  assert.equal(first.ok, false)
  assert.equal(bar.hidden, false)
  assert.ok(bar.classList.has('error') && bar.classList.has('empty'))
  up = true
  const retry = await fetchLike('/api/data?days=7')
  assert.equal(retry.ok, true)
  assert.equal(bar.hidden, true)
  assert.ok(!bar.classList.has('empty') && !bar.classList.has('error'), 'the charts are no longer hidden')
  assert.equal(msg.textContent, '')
})

test('a failure over drawn charts keeps them (no empty class)', async () => {
  const { bar, fetchLike, draw } = setup(async () => { throw down })
  draw()
  await fetchLike('/api/data?days=7')
  assert.ok(bar.classList.has('error') && !bar.classList.has('empty'))
})

test('the first call paints the cached snapshot, later calls ask the worker and update the cache', async () => {
  const cache = { 7: { cached: true } }
  let asked = 0
  const { fetchLike } = setup(async () => { asked++; return { fresh: true } }, cache)
  assert.deepEqual(await (await fetchLike('/api/data?days=7')).json(), { cached: true })
  assert.equal(asked, 0)
  assert.deepEqual(await (await fetchLike('/api/data?days=7')).json(), { fresh: true })
  assert.deepEqual(cache[7], { fresh: true })
})

test('other URLs go to the real fetch', async () => {
  const { fetchLike } = setup(async () => ({}))
  assert.equal(await fetchLike('/api/cli-tools'), 'real')
})

import { makeAsk } from '../dashboard-web/js/orca-source.js'

const expired = () => Object.assign(new Error('snapshot expired'), { code: 'expired' })

test('ask: joins the chunks of the range it opened', async () => {
  const calls = []
  const ask = makeAsk(async (name, input) => {
    calls.push([name, input.index ?? input.days])
    if (name === 'tasks.open') return { id: 'a.1', days: input.days, chunks: 2 }
    return { id: input.id, chunk: input.index === 0 ? '{"days":' : '30}' }
  })
  assert.deepEqual(await ask(30), { days: 30 })
  assert.deepEqual(calls, [['tasks.open', 30], ['tasks.chunk', 0], ['tasks.chunk', 1]])
})

test('ask: after a worker restart the old id expires and the requested range is opened again', async () => {
  let restarted = false
  const opens = []
  const ask = makeAsk(async (name, input) => {
    if (name === 'tasks.open') { opens.push(input.days); return { id: restarted ? 'new.1' : 'old.1', days: input.days, chunks: 2 } }
    if (!restarted) { restarted = true; throw expired() } // first chunk call lands on the restarted worker
    return { id: input.id, chunk: input.index === 0 ? '{"range":' : '30}' }
  })
  assert.deepEqual(await ask(30), { range: 30 })
  assert.deepEqual(opens, [30, 30])
})

test('ask: never mixes a chunk of another snapshot, and gives up after repeated expiry', async () => {
  const mixed = makeAsk(async (name, input) => (name === 'tasks.open' ? { id: 'a.1', days: input.days, chunks: 1 } : { id: 'b.9', chunk: '{"other":1}' }))
  await assert.rejects(mixed(7), /expired|another snapshot/)
  const wrongRange = makeAsk(async () => ({ id: 'a.1', days: 7, chunks: 1 }))
  await assert.rejects(wrongRange(30), /not 30/)
})

test('an API error reaches the panel message unchanged: the loading wording and the failure wording stay distinct', async () => {
  for (const [message, wording] of [['Dashboard API chưa sẵn sàng (HTTP 503, đang tải).', /đang tải/], ['Dashboard API chưa sẵn sàng (HTTP 503: Dashboard data is temporarily unavailable).', /temporarily unavailable/]]) {
    let shown
    const fetchLike = makeFetch({
      real: async () => 'real', base: 'http://127.0.0.1:4747', cached: () => null, remember: () => {}, firstDays: 7, hasCharts: () => false, ok: () => {},
      ask: makeAsk(async () => { throw Object.assign(new Error(message), { code: 'offline' }) }),
      fail: (e) => { shown = e.message }
    })
    const r = await fetchLike('/api/data?days=7')
    assert.equal(r.ok, false)
    assert.equal(shown, message)
    assert.match(shown, wording)
    assert.doesNotMatch(shown, wording.source === 'đang tải' ? /temporarily/ : /đang tải/)
  }
})
