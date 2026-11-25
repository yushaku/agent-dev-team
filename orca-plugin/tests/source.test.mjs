import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barView, makeFetch } from '../dashboard-web/js/orca-source.js'

const fakeBar = () => {
  const classes = new Set()
  return {
    hidden: true,
    classList: {
      add: (c) => classes.add(c),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      has: (c) => classes.has(c),
    },
  }
}
const setup = (ask, cache = {}) => {
  const bar = fakeBar(),
    msg = { textContent: '' },
    view = barView(bar, msg)
  let drawn = false
  const fetchLike = makeFetch({
    real: async () => 'real',
    base: 'http://127.0.0.1:4747',
    ask,
    cached: (d) => cache[d] ?? null,
    remember: (d, v) => {
      cache[d] = v
    },
    firstDays: 7,
    hasCharts: () => drawn,
    ok: () => view.ok(),
    fail: (e, had) => view.fail(e.message, had),
  })
  return {
    bar,
    msg,
    fetchLike,
    draw: () => {
      drawn = true
    },
  }
}
const down = Object.assign(new Error('offline'), { code: 'offline' })

test('cold failure hides the empty chart frames, a successful retry shows them again', async () => {
  let up = false
  const { bar, msg, fetchLike } = setup(async () => {
    if (!up) throw down
    return { sessions: [] }
  })
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
  const { bar, fetchLike, draw } = setup(async () => {
    throw down
  })
  draw()
  await fetchLike('/api/data?days=7')
  assert.ok(bar.classList.has('error') && !bar.classList.has('empty'))
})

test('the first call paints the cached snapshot, later calls ask the worker and update the cache', async () => {
  const cache = { 7: { cached: true } }
  let asked = 0
  const { fetchLike } = setup(async () => {
    asked++
    return { fresh: true }
  }, cache)
  assert.deepEqual(await (await fetchLike('/api/data?days=7')).json(), { cached: true })
  assert.equal(asked, 0)
  assert.deepEqual(await (await fetchLike('/api/data?days=7')).json(), { fresh: true })
  assert.deepEqual(cache[7], { fresh: true })
})

test('other URLs go to the real fetch', async () => {
  const { fetchLike } = setup(async () => ({}))
  assert.equal(await fetchLike('/api/cli-tools'), 'real')
})

import { makeAsk, viewHasCharts } from '../dashboard-web/js/orca-source.js'

const expired = () => Object.assign(new Error('snapshot expired'), { code: 'expired' })

test('ask: joins the chunks of the range it opened', async () => {
  const calls = []
  const ask = makeAsk(async (name, input) => {
    calls.push([name, input.index ?? input.days])
    if (name === 'tasks.open') return { id: 'a.1', days: input.days, chunks: 2 }
    return { id: input.id, chunk: input.index === 0 ? '{"days":' : '30}' }
  })
  assert.deepEqual(await ask(30), { days: 30 })
  assert.deepEqual(calls, [
    ['tasks.open', 30],
    ['tasks.chunk', 0],
    ['tasks.chunk', 1],
  ])
})

test('ask: after a worker restart the old id expires and the requested range is opened again', async () => {
  let restarted = false
  const opens = []
  const ask = makeAsk(async (name, input) => {
    if (name === 'tasks.open') {
      opens.push(input.days)
      return { id: restarted ? 'new.1' : 'old.1', days: input.days, chunks: 2 }
    }
    if (!restarted) {
      restarted = true
      throw expired()
    } // first chunk call lands on the restarted worker
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
  for (const [message, wording] of [
    ['Dashboard API chưa sẵn sàng (HTTP 503, đang tải).', /đang tải/],
    ['Dashboard API chưa sẵn sàng (HTTP 503: Dashboard data is temporarily unavailable).', /temporarily unavailable/],
  ]) {
    let shown
    const fetchLike = makeFetch({
      real: async () => 'real',
      base: 'http://127.0.0.1:4747',
      cached: () => null,
      remember: () => {},
      firstDays: 7,
      hasCharts: () => false,
      ok: () => {},
      ask: makeAsk(async () => {
        throw Object.assign(new Error(message), { code: 'offline' })
      }),
      fail: (e) => {
        shown = e.message
      },
    })
    const r = await fetchLike('/api/data?days=7')
    assert.equal(r.ok, false)
    assert.equal(shown, message)
    assert.match(shown, wording)
    assert.doesNotMatch(shown, wording.source === 'đang tải' ? /temporarily/ : /đang tải/)
  }
})

test('extra routes (the skill sheet) are answered by their own handler and a refusal keeps its status', async () => {
  const { fetchLike } = setup(async () => ({}))
  const asked = []
  const withExtra = makeFetch({
    real: async () => 'real',
    base: 'http://127.0.0.1:4747',
    ask: async () => ({}),
    cached: () => null,
    remember: () => {},
    firstDays: 7,
    hasCharts: () => false,
    ok: () => {},
    fail: () => {},
    extra: {
      '/api/team/skill': async (url) => {
        asked.push(url.searchParams.get('name'))
        if (url.searchParams.get('name') === '..') throw Object.assign(new Error('bad name'), { code: 'http_400' })
        if (url.searchParams.get('name') === 'x') throw new Error('worker gone')
        return { name: 'ok' }
      },
    },
  })
  const ok = await withExtra('/api/team/skill?name=team-builder')
  assert.equal(ok.ok, true)
  assert.deepEqual(await ok.json(), { name: 'ok' })
  assert.equal((await withExtra('/api/team/skill?name=..')).status, 400)
  assert.equal((await withExtra('/api/team/skill?name=x')).status, 503)
  assert.equal(await withExtra('/api/cli-tools'), 'real')
  assert.deepEqual(asked, ['team-builder', '..', 'x'])
  void fetchLike
})

test('the offline check looks at the view this panel shows, so a rendered Agents tools view stays visible when a refresh fails', async () => {
  // A page with only the Agents tools charts drawn: nothing in #tk-theo-repo (the Tasks view is not rendered here).
  const doc = { querySelector: (selector) => (selector === '#tk-agents-tools .chart-scroll svg' ? {} : null) }
  assert.equal(viewHasCharts(doc, 'tk-agents-tools'), true)
  assert.equal(viewHasCharts(doc, 'tk-theo-repo'), false)
  let up = true
  const bar = fakeBar(),
    msg = { textContent: '' },
    view = barView(bar, msg)
  const fetchLike = makeFetch({
    real: async () => 'real',
    base: 'http://127.0.0.1:4747',
    cached: () => null,
    remember: () => {},
    firstDays: 7,
    ask: async () => {
      if (!up) throw down
      return { sessions: [] }
    },
    hasCharts: () => viewHasCharts(doc, 'tk-agents-tools'),
    ok: () => view.ok(),
    fail: (e, had) => view.fail(e.message, had),
  })
  assert.equal((await fetchLike('/api/data?days=7')).ok, true)
  up = false
  assert.equal((await fetchLike('/api/data?days=7')).ok, false)
  assert.ok(bar.classList.has('error') && !bar.classList.has('empty'), 'the drawn charts are kept under the error bar')
  // The Tasks-only predicate (the old one) would have hidden them:
  const tasksOnly = makeFetch({
    real: async () => 'real',
    base: 'http://127.0.0.1:4747',
    cached: () => null,
    remember: () => {},
    firstDays: 7,
    ask: async () => {
      throw down
    },
    hasCharts: () => viewHasCharts(doc, 'tk-theo-repo'),
    ok: () => {},
    fail: (e, had) => view.fail(e.message, had),
  })
  await tasksOnly('/api/data?days=7')
  assert.ok(bar.classList.has('empty'), 'checking the wrong view marks a rendered panel as empty')
})

test('a too-large skill document reaches the sheet as HTTP 413', async () => {
  const withExtra = makeFetch({
    real: async () => 'real',
    base: 'http://127.0.0.1:4747',
    ask: async () => ({}),
    cached: () => null,
    remember: () => {},
    firstDays: 7,
    hasCharts: () => false,
    ok: () => {},
    fail: () => {},
    extra: {
      '/api/team/skill': async () => {
        throw Object.assign(new Error('Tài liệu của skill quá lớn'), { code: 'too_large' })
      },
    },
  })
  const refused = await withExtra('/api/team/skill?name=big')
  assert.equal(refused.status, 413)
  assert.deepEqual(await refused.json(), { error: 'Tài liệu của skill quá lớn' }, "the worker's message reaches the sheet")
})
