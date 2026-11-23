import { assert, test } from 'orca/testing'
import { health, report, type Status } from './ledger-host'

const base: Status = { host: 'orca-plugin', home: '/h', pid: 1, node: 'v24', startedAt: '2026-01-01T00:00:00Z', lock: 'held', running: false, passes: 1 }
const pass = (errors: string[]) => ({ reason: 'start', startedAt: '2026-01-01T12:03:00Z', finishedAt: '2026-01-01T12:04:00Z', ms: 900, timings: {}, errors })

test('status bar says ✓ after a clean pass and ✗ N after errors', () => {
  assert.match(report({ ...base, lastPass: pass([]) }).text, /^Ledger \d\d:\d\d ✓$/)
  const bad = report({ ...base, lastPass: pass(['a', 'b']) })
  assert.match(bad.text, /✗ 2$/)
  assert.equal(bad.tone, 'danger')
})

test('status bar waits while another host holds the lock', () => {
  assert.equal(report({ ...base, lock: 'waiting', lockedBy: 'launchd pid 9' }).text, 'Ledger waiting')
})

test('a listener failure shows in the status bar', () => {
  const r = report({ ...base, lastPass: pass([]) }, { bound: [], busy: [], error: '4748 EACCES' })
  assert.match(r.text, /✓ ⚠$/)
  assert.equal(r.tone, 'warning')
  assert.match(r.tooltip, /Listener error: 4748 EACCES/)
})

test('the status bar says which ports are bound and which wait for another server', () => {
  const up = report({ ...base, lastPass: pass([]) }, { bound: [4748, 4747], busy: [] })
  assert.match(up.text, /✓ 4747·4748$/)
  assert.match(up.tooltip, /Listening on 127\.0\.0\.1: 4747, 4748/)
  const waiting = report({ ...base, lastPass: pass([]) }, { bound: [4748], busy: [4747] })
  assert.match(waiting.text, /✓ 4748 \(4747 busy\)$/)
  assert.equal(waiting.tone, 'success', 'a busy 4747 is expected before the cutover, not a warning')
  assert.match(waiting.tooltip, /Waiting for port 4747 \(in use by another server; retrying\)/)
  assert.match(report({ ...base, lastPass: pass([]) }, { bound: [4748], busy: [], apiError: 'AGENT_DASHBOARD_WEB must contain index.html' }).text, /⚠$/)
})

test('a ledger that cannot run says so, not "waiting"', () => {
  const r = report({ ...base, lock: 'waiting', lastError: 'Error: EACCES: permission denied, mkdir /x', lastPass: pass(['Error: EACCES']) })
  assert.match(r.text, /^Ledger ✗ not running/)
  assert.equal(r.tone, 'danger')
})

test('health is ok only with a clean pass and the lock held, and says what is bound', () => {
  assert.deepEqual(health({ ...base, lastPass: pass([]) }, { bound: [4748], busy: [4747] }).listening, { bound: [4748], waiting: [4747], error: undefined, apiError: undefined })
  assert.equal(health(undefined).ok, false)
  assert.equal(health({ ...base, lastPass: pass([]) }).ok, true)
  assert.equal(health({ ...base, lastPass: pass(['x']) }).ok, false)
  assert.equal(health({ ...base, lock: 'waiting', lastPass: pass([]) }).ok, false)
})
