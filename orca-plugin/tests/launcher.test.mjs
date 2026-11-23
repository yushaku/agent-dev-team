import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, MARKER } from '../dashboard-web/js/orca-launcher.js'

const page = '<!doctype html><html><head><meta name="team-dashboard" content="page"></head><body>dashboard</body></html>'
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

test('a 200 fallback page with a doctype is not the dashboard: the launcher stays and keeps its retry', async () => {
  const fallback = '<!doctype html><html><head><title>404 Not Found</title></head><body>Not Found</body></html>'
  const s = stage()
  await launch({ fetch: async () => response(200, fallback), doc: s.doc, target: s.target, view: 'tk-agents-tools' })
  assert.deepEqual(s.written, [], 'a server fallback page that starts with a doctype is not written into the document')
  assert.match(s.state.textContent, /not the dashboard page/)
  assert.equal(s.retry.hidden, false)
  assert.equal(s.target.__orcaView, undefined)
  // The retry works once the real page is served.
  let serving = fallback
  const again = stage()
  await launch({ fetch: async () => response(200, serving), doc: again.doc, target: again.target, view: 'tk-agents-tools' })
  serving = page
  again.retry.onclick()
  await new Promise((done) => setTimeout(done, 20))
  assert.deepEqual(again.written, ['open', page, 'close'])
})

test('the marker is in the shipped index.html and in nothing a fallback page would carry', () => {
  const index = readFileSync(join(import.meta.dirname, '../dashboard-web/index.html'), 'utf8')
  assert.match(index, MARKER)
  assert.doesNotMatch('<!doctype html><title>x</title><body>The page you asked for is not here</body>', MARKER)
})
