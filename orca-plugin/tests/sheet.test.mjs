// The skill sheet at its boundary: a click on [data-skill] asks /api/team/skill (in the panel: through the worker) and
// shows what comes back, or why it could not. A minimal DOM stands in for the browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'

class Node_ {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.textContent = ''; this.innerHTML = ''; this.listeners = {}; this.dataset = {} }
  replaceChildren(...nodes) { this.children = nodes }
  append(...nodes) { this.children.push(...nodes) }
  addEventListener(type, fn) { this.listeners[type] = fn }
  focus() {}
  querySelectorAll() { return [] }
}
const byId = new Map()
const el = (id) => { if (!byId.has(id)) byId.set(id, Object.assign(new Node_('div'), { id })); return byId.get(id) }
let click
globalThis.document = {
  querySelector: (selector) => { const e = el(selector.slice(1)); if (selector === '#sheet') Object.assign(e, { open: e.open ?? false, showModal() { this.open = true }, close() { this.open = false }, scrollTop: 0, getBoundingClientRect: () => ({}) }); return e },
  createElement: (tag) => new Node_(tag),
  addEventListener: (type, fn) => { if (type === 'click') click = fn },
}
const { initSheet } = await import('../dashboard-web/js/sheet.js')
initSheet()

const open = async (name) => {
  click({ target: { closest: (selector) => (selector === '[data-skill]' ? { dataset: { skill: name } } : null) } })
  await new Promise((done) => setTimeout(done, 30))
  return el('sheet-body').children
}
const refusal = (status, error) => ({ ok: false, status, json: async () => (error === undefined ? { throws: true } : { error }) })

test('a skill document is shown in the sheet', async () => {
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => ({ origin: 'own', source: 'team', description: 'Builds', path: '~/x/SKILL.md', refs: [], body: '# Builder\n\ntext' }) })
  const nodes = await open('team-builder')
  assert.equal(el('sheet-title').textContent, 'team-builder')
  assert.ok(nodes.length >= 2)
  assert.equal(el('sheet').open, true)
})

test('a too-large document shows the worker\'s message as text, with a way to read it in the browser', async () => {
  const message = 'Tài liệu của skill quá lớn để mở trong panel (1200123 byte, tối đa 900000). Mở trên trình duyệt.'
  const opened = []
  globalThis.orca = { shell: { openExternal: (url) => { opened.push(url); return Promise.resolve({ opened: true }) } } }
  globalThis.fetch = async () => refusal(413, message)
  const nodes = await open('big-skill')
  assert.equal(nodes[0].textContent, 'Lỗi: ' + message, 'the message is text, not HTML')
  assert.equal(nodes[0].innerHTML, '', 'it is never put through innerHTML')
  const button = nodes.find((n) => n.tag === 'button')
  assert.ok(button, 'a browser fallback is offered')
  assert.match(button.textContent, /trình duyệt/)
  button.onclick()
  assert.deepEqual(opened, ['http://127.0.0.1:4747/#tk-agents-tools'])
})

test('an HTML-looking refusal text is shown literally, other refusals have no browser button, and a body without an error falls back to the status', async () => {
  globalThis.orca = { shell: { openExternal: () => Promise.resolve({ opened: true }) } }
  globalThis.fetch = async () => refusal(413, '<img src=x onerror=alert(1)> quá lớn')
  let nodes = await open('evil')
  assert.equal(nodes[0].textContent, 'Lỗi: <img src=x onerror=alert(1)> quá lớn')
  globalThis.fetch = async () => refusal(400, 'bad name')
  nodes = await open('..')
  assert.equal(nodes[0].textContent, 'Lỗi: bad name')
  assert.equal(nodes.some((n) => n.tag === 'button'), false, 'only a too-large document gets the browser button')
  globalThis.fetch = async () => refusal(503, undefined)
  nodes = await open('x')
  assert.match(nodes[0].textContent, /\/api\/team\/skill\?name=x: HTTP 503/)
})

test('outside Orca (no bridge) a too-large refusal shows the message and no button', async () => {
  delete globalThis.orca
  globalThis.fetch = async () => refusal(413, 'quá lớn')
  const nodes = await open('big')
  assert.equal(nodes[0].textContent, 'Lỗi: quá lớn')
  assert.equal(nodes.some((n) => n.tag === 'button'), false)
})
