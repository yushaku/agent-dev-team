import { assert, test } from 'orca/testing'
import { chunks, prepare, REPLY_LIMIT, trim } from './trim'

const CAP = 1_048_576 // Orca's cap on one worker answer
const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

const run = (n: number, events = 1, body = 5000) => ({
  id: 'r' + n,
  tasks: [{ id: 't' + n, title: 'Tiêu đề 😀 ' + n }],
  events: Array.from({ length: events }, (_, i) => ({ id: `e${n}-${i}`, from: 'PO', to: 'Orchestrator', text: 'xin chào "quoted" \\ back', body: 'ế'.repeat(body) }))
})
/** A realistic 30 to 90 day payload: thousands of sessions and hundreds of runs with long messages. */
const busy = (sessions: number, runs: number) => ({
  generated_at: 1, days: 90, dates: ['d'], roles_cfg: {}, known_roles: [], rtk: { big: 1 }, skills_installed: [],
  features: { runs: [{ repo: 'f1', big: 'x'.repeat(5000) }, { repo: 'f1' }, { repo: 'f2' }] },
  sessions: Array.from({ length: sessions }, (_, i) => ({ id: 's' + i, run_id: 'r' + (i % runs), preview: 'p'.repeat(160), feature_segments: [1], ctx: [1], cwd: '/x', models: {}, days: { a: i } })),
  orca: { available: true, runs: Array.from({ length: runs }, (_, i) => run(i, 40, 3000)) }
})

test('keeps what the Tasks tab reads, drops the rest, keeps repo names of feature runs', () => {
  const out = trim(
    {
      generated_at: 1, days: 7, dates: ['d'], roles_cfg: {}, known_roles: [], rtk: { big: 1 }, skills_installed: [],
      features: { runs: [{ repo: 'a', big: 1 }, { repo: 'a' }, { repo: 'b' }] },
      sessions: [{ id: 's', run_id: 'r1', feature_segments: [1], ctx: [1], cwd: '/x', models: {} }],
      orca: { available: true, runs: [run(1)] }
    },
    100
  ) as any
  assert.deepEqual(Object.keys(out).sort(), ['dates', 'days', 'features', 'generated_at', 'known_roles', 'orca', 'roles_cfg', 'sessions'])
  assert.deepEqual(out.features, { runs: [{ repo: 'a' }, { repo: 'b' }] })
  assert.deepEqual(out.sessions, [{ id: 's', run_id: 'r1' }])
  assert.equal(out.orca.runs[0].events[0].body.length, 101)
  assert.equal((trim({ sessions: [], orca: { runs: [run(1)] } }, 0) as any).orca.runs[0].events[0].body, undefined)
})

test('30 to 90 day volumes: every reply stays under the answer cap and the pieces rebuild the snapshot', () => {
  for (const [sessions, runs] of [[1000, 22], [6000, 200], [20000, 500]]) {
    const { text, bodyCap } = prepare(busy(sessions, runs))
    const pieces = chunks(text)
    assert.ok(pieces.length >= 1)
    for (const piece of pieces) assert.ok(size({ chunk: piece }) <= REPLY_LIMIT, `reply ${size({ chunk: piece })} bytes`)
    for (const piece of pieces) assert.ok(size({ chunk: piece }) < CAP)
    assert.equal(pieces.join(''), text)
    const back = JSON.parse(pieces.join('')) as any
    assert.equal(back.sessions.length, sessions)
    assert.equal(back.orca.runs.length, runs)
    assert.ok(bodyCap > 0, 'bodies survive at normal volume')
  }
})

test('a snapshot beyond the total guard shrinks bodies, then refuses', () => {
  const data = busy(200, 60)
  assert.ok(prepare(data, 3_000_000).bodyCap < 600)
  assert.throws(() => prepare(data, 10), /limit is 10/)
})

test('chunking survives quotes, backslashes, multi-byte text and a tiny limit', () => {
  const text = JSON.stringify({ a: '"\\"\\\\ế😀'.repeat(500) })
  const pieces = chunks(text, 400)
  for (const piece of pieces) assert.ok(size({ chunk: piece }) <= 400)
  assert.equal(pieces.join(''), text)
})
