// Boots the dashboard's own dash.js inside an Orca HTML panel. A panel cannot fetch the network,
// so dash.js's fetch("/api/data?days=N") is answered by the plugin worker through plugin.request.
import { show } from './js/dash.js'
import { state } from './js/lib/charts.js'
import { barView, makeAsk, makeFetch } from './source.js'

const DASHBOARD = 'http://127.0.0.1:4747'
const VIEW = 'tk-theo-repo' // the Tasks tab

/* ---- status bar: offline message, retry, link out ---- */
const bar = document.createElement('div')
bar.id = 'plugin-bar'
bar.setAttribute('role', 'status')
bar.hidden = true
bar.innerHTML = '<span class="msg"></span><button type="button" id="plugin-retry">Thử lại</button><button type="button" id="plugin-open">Mở trên trình duyệt ↗</button>'
document.querySelector('.dash').prepend(bar)
const view = barView(bar, bar.querySelector('.msg'))
bar.querySelector('#plugin-retry').addEventListener('click', () => document.getElementById('refresh').click())
bar.querySelector('#plugin-open').addEventListener('click', () => orca.shell.openExternal(`${DASHBOARD}/#${VIEW}`))

/* ---- /api/data goes through the worker, in chunks (one reply may not pass 1 MiB) ---- */
const unwrap = (out) => (out && Object.keys(out).length === 1 && 'output' in out ? out.output : out)
const request = async (name, input) => unwrap(await orca.plugin.request(name, input, { timeoutMs: 40000 }))
const ask = makeAsk(request)

/* Stale while revalidate: the last snapshot paints at once (a worker round trip lands after the
   page has loaded), then the worker's answer replaces it. localStorage may be missing: then no cache. */
const CACHE = (days) => `team-dashboard-plugin:tasks:${days}`
const cached = (days) => { try { return JSON.parse(localStorage.getItem(CACHE(days))) } catch (e) { return null } }
const remember = (days, data) => { try { localStorage.setItem(CACHE(days), JSON.stringify(data)) } catch (e) {} }
const firstFromCache = !!cached(state.days)

window.fetch = makeFetch({
  real: window.fetch.bind(window), base: DASHBOARD, ask, cached, remember, firstDays: state.days,
  hasCharts: () => !!document.querySelector('#c-tree svg'),
  ok: () => view.ok(),
  fail: (e, hadCharts) => view.fail(e.code === 'offline' ? e.message + ' Chạy dashboard rồi bấm Thử lại.' : `Không tải được dữ liệu (${e.code || 'error'}: ${e.message}).`, hadCharts)
})

/* A frame may refuse history.replaceState; dash.js only uses it to mirror the tab in the hash. */
const replaceState = history.replaceState.bind(history)
history.replaceState = (...args) => { try { replaceState(...args) } catch (e) {} }

const stale = firstFromCache
show(document.getElementById(VIEW))
/* A cached first paint is refreshed right after it, once dash.js finishes that load. */
if (stale) setTimeout(() => document.getElementById('refresh').click(), 0)
