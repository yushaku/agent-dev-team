import { assert, test } from 'orca/testing'
import { describeFailure, health, type Status } from './ledger-host'

const base: Status = { host: 'orca-plugin', home: '/h', pid: 1, node: 'v24', startedAt: '2026-01-01T00:00:00Z', lock: 'held', running: false, passes: 1 }
const pass = (errors: string[]) => ({ reason: 'start', startedAt: '2026-01-01T12:03:00Z', finishedAt: '2026-01-01T12:04:00Z', ms: 900, timings: {}, errors })

test('health is ok only with a clean pass and the lock held, and says what is bound', () => {
  assert.deepEqual(health({ ...base, lastPass: pass([]) }, { bound: [], busy: [4747] }).listening, {
    bound: [],
    waiting: [4747],
    error: undefined,
    apiError: undefined,
  })
  assert.equal(health(undefined).ok, false)
  assert.equal(health({ ...base, lastPass: pass([]) }).ok, true)
  assert.equal(health({ ...base, lastPass: pass(['x']) }).ok, false)
  assert.equal(health({ ...base, lock: 'waiting', lastPass: pass([]) }).ok, false)
})

test('a loading API and a failing API are described differently', () => {
  assert.equal(describeFailure(503, '{"loading":true}'), 'HTTP 503, đang tải')
  assert.equal(describeFailure(503, 'Dashboard data is temporarily unavailable'), 'HTTP 503: Dashboard data is temporarily unavailable')
  assert.equal(describeFailure(503, '{"error":"x"}'), 'HTTP 503: {"error":"x"}', 'a 503 without the loading flag is a failure')
  assert.equal(describeFailure(500, 'Dashboard request failed'), 'HTTP 500: Dashboard request failed')
  assert.equal(describeFailure(404, ''), 'HTTP 404')
})
