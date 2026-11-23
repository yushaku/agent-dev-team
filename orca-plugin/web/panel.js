// Boots the dashboard's own dash.js inside an Orca HTML panel. A panel cannot fetch the network,
// so dash.js's fetch("/api/data?days=N") is answered by the plugin worker through plugin.request.
import { show } from './js/dash.js'
import { state } from './js/lib/charts.js'

const DASHBOARD = 'http://127.0.0.1:4747'
const VIEW = 'tk-theo-repo' // the Tasks tab

/* ---- status bar: offline message, retry, link out ---- */
const bar = document.createElement('div')
bar.id = 'plugin-bar'
bar.setAttribute('role', 'status')
bar.hidden = true
bar.innerHTML = '<span class="msg"></span><button type="button" id="plugin-retry">Thử lại</button><button type="button" id="plugin-open">Mở trên trình duyệt ↗</button>'
document.querySelector('.dash').prepend(bar)
const msg = bar.querySelector('.msg')
const status = (text) => {
  bar.classList.toggle('error', !!text)
  bar.hidden = !text
  msg.textContent = text || ''
}
bar.querySelector('#plugin-retry').addEventListener('click', () => document.getElementById('refresh').click())
bar.querySelector('#plugin-open').addEventListener('click', () => orca.shell.openExternal(`${DASHBOARD}/#${VIEW}`))

/* ---- /api/data goes through the worker ---- */
const ask = async (days) => {
  const out = await orca.plugin.request('tasks.data', { days }, { timeoutMs: 40000 })
  return out && Object.keys(out).length === 1 && 'output' in out ? out.output : out
}
const failed = (e) => {
  bar.classList.toggle('empty', !document.querySelector('#c-tree svg')) // nothing drawn yet: hide the empty chart frames
  status(e.code === 'offline' ? e.message + ' Chạy dashboard rồi bấm Thử lại.' : `Không tải được dữ liệu (${e.code || 'error'}: ${e.message}).`)
}

/* Stale while revalidate: the last snapshot paints at once (a worker round trip lands after the
   page has loaded), then the worker's answer replaces it. localStorage may be missing: then no cache. */
const CACHE = (days) => `team-dashboard-plugin:tasks:${days}`
const cached = (days) => { try { return JSON.parse(localStorage.getItem(CACHE(days))) } catch (e) { return null } }
const remember = (days, data) => { try { localStorage.setItem(CACHE(days), JSON.stringify(data)) } catch (e) {} }
let fromCache = cached(state.days) ? state.days : 0

const realFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = new URL(String(input), DASHBOARD)
  if (url.pathname !== '/api/data') return realFetch(input, init)
  const days = Number(url.searchParams.get('days')) || 7
  if (fromCache === days) {
    fromCache = 0
    const data = cached(days)
    if (data) return { ok: true, status: 200, json: async () => data }
  }
  try {
    const data = await ask(days)
    status('')
    remember(days, data)
    return { ok: true, status: 200, json: async () => data }
  } catch (e) {
    failed(e)
    return { ok: false, status: 503, json: async () => ({}) }
  }
}

/* A frame may refuse history.replaceState; dash.js only uses it to mirror the tab in the hash. */
const replaceState = history.replaceState.bind(history)
history.replaceState = (...args) => { try { replaceState(...args) } catch (e) {} }

const stale = fromCache
show(document.getElementById(VIEW))
/* A cached first paint is refreshed right after it, once dash.js finishes that load. */
if (stale) setTimeout(() => document.getElementById('refresh').click(), 0)
