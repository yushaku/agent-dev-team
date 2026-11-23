import { assert, test } from 'orca/testing'
import { ANSWER_LIMIT, fit, trim } from './trim'

const run = (n: number) => ({
  id: 'r' + n,
  tasks: [{ id: 't' + n }],
  events: [{ id: 'e' + n, from: 'PO', to: 'Orchestrator', text: 'hi', body: 'x'.repeat(5000) }]
})

test('keeps what the Tasks tab reads and drops the rest', () => {
  const out = trim(
    {
      generated_at: 1, days: 7, dates: ['d'], roles_cfg: {}, known_roles: [], rtk: { big: 1 }, features: {}, skills_installed: [],
      sessions: [{ id: 's', run_id: 'r1', feature_segments: [1], ctx: [1], cwd: '/x', models: {} }],
      orca: { available: true, runs: [run(1)] }
    },
    100
  ) as any
  assert.deepEqual(Object.keys(out).sort(), ['dates', 'days', 'generated_at', 'known_roles', 'orca', 'roles_cfg', 'sessions'])
  assert.deepEqual(out.sessions, [{ id: 's', run_id: 'r1' }])
  assert.equal(out.orca.available, true)
  assert.equal(out.orca.runs[0].events[0].body.length, 101)
  const bare = trim({ sessions: [], orca: { runs: [run(1)] } }, 0) as any
  assert.equal(bare.orca.runs[0].events[0].body, undefined)
})

test('shrinks message bodies until the answer fits', () => {
  const data = { sessions: [], orca: { runs: Array.from({ length: 3000 }, (_, i) => run(i)) } }
  const { bytes, bodyCap } = fit(data)
  assert.ok(bytes <= ANSWER_LIMIT)
  assert.ok(bodyCap < 600)
})

test('refuses when even bodiless data is too big', () => {
  assert.throws(() => fit({ sessions: [], orca: { runs: [run(1)] } }, 10), /limit is 10/)
})
