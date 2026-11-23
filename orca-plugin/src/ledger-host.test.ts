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

test('health is ok only with a clean pass and the lock held', () => {
  assert.equal(health(undefined).ok, false)
  assert.equal(health({ ...base, lastPass: pass([]) }).ok, true)
  assert.equal(health({ ...base, lastPass: pass(['x']) }).ok, false)
  assert.equal(health({ ...base, lock: 'waiting', lastPass: pass([]) }).ok, false)
})
