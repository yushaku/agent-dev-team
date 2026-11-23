import { test } from 'node:test'
import assert from 'node:assert/strict'
import { launch } from '../dashboard-web/js/orca-launcher.js'

const page = '<!doctype html><html><body>dashboard</body></html>'
function stage() {
  const state = { textContent: 'Đang tải dashboard…' }, retry = { hidden: true, onclick: null }
  const written = []
  const doc = { getElementById: (id) => (id === 'state' ? state : retry), open: () => written.push('open'), write: (html) => written.push(html), close: () => written.push('close') }
  const target = {}
  return { state, retry, written, doc, target }
}
const response = (status, body, ok = status >= 200 && status < 300) => ({ ok, status, text: async () => body })

test('a good page replaces the launcher in the same document and names the view', async () => {
  const s = stage()
  await launch({ fetch: async () => response(200, page), doc: s.doc, target: s.target, view: 'tk-agents-tools' })
  assert.deepEqual(s.written, ['open', page, 'close'])
  assert.equal(s.target.__orcaView, 'tk-agents-tools')
})

test('a non-success response leaves the launcher in place with a message and a retry', async () => {
  const s = stage()
  await launch({ fetch: async () => response(404, '<html>not found</html>'), doc: s.doc, target: s.target, view: 'tk-agents-tools' })
  assert.deepEqual(s.written, [], 'the error page was not written into the document')
  assert.match(s.state.textContent, /Không tải được dashboard \(HTTP 404\)/)
  assert.equal(s.retry.hidden, false)
  assert.equal(s.target.__orcaView, undefined)
})

test('a rejected request does the same, and a page that is not the dashboard is refused', async () => {
  const s = stage()
  await launch({ fetch: async () => { throw new TypeError('failed to fetch') }, doc: s.doc, target: s.target, view: 'tk-agents-tools' })
  assert.deepEqual(s.written, [])
  assert.match(s.state.textContent, /failed to fetch/)
  assert.equal(s.retry.hidden, false)
  const other = stage()
  await launch({ fetch: async () => response(200, '<html><body>error</body></html>'), doc: other.doc, target: other.target, view: 'tk-agents-tools' })
  assert.deepEqual(other.written, [], 'a 200 that is not the dashboard page is not written either')
  assert.equal(other.retry.hidden, false)
})

test('retry tries again and recovers', async () => {
  const s = stage()
  let up = false
  await launch({ fetch: async () => (up ? response(200, page) : response(503, 'down')), doc: s.doc, target: s.target, view: 'tk-agents-tools' })
  assert.equal(s.retry.hidden, false)
  up = true
  s.retry.onclick()
  await new Promise((done) => setTimeout(done, 20))
  assert.deepEqual(s.written, ['open', page, 'close'])
})
