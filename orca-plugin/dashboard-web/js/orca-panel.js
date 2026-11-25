// Boots the dashboard's own dash.js inside an Orca HTML panel (main.js loads this when window.orca exists). A panel cannot fetch the network,
// so dash.js's fetch("/api/data?days=N") is answered by the plugin worker through plugin.request.
import { show, showView } from './dash.js'
import { state } from './lib/charts.js'
import { barView, makeAsk, makeFetch, viewHasCharts } from './orca-source.js'

const DASHBOARD = 'http://127.0.0.1:4747'
/* The page's own top bar is hidden in the sidebar, so the panel has its
   own tab bar plus a button that opens the full web UI in the browser. The last tab is remembered per panel. */
const VIEWS = [['tk-tong-quan', 'Overview'], ['tk-theo-repo', 'Tasks'], ['tk-agents-tools', 'Agents tools']]
const TAB_KEY = 'team-dashboard-plugin:tab'
let current = VIEWS[0][0]
try { const saved = localStorage.getItem(TAB_KEY); if (VIEWS.some(([id]) => id === saved)) current = saved } catch (e) {}

/* ---- tab bar and the full web UI ---- */
const tabs = document.createElement('nav')
tabs.id = 'plugin-tabs'
tabs.setAttribute('aria-label', 'Mục dashboard')
tabs.innerHTML = '<div class="seg" role="group">' + VIEWS.map(([id, label]) => `<button type="button" data-tab="${id}">${label}</button>`).join('') + '</div>' +
  '<button type="button" id="plugin-open" title="Mở dashboard đầy đủ trên trình duyệt">Giao diện web ↗</button>'
const tabButtons = [...tabs.querySelectorAll('[data-tab]')]
const mark = () => tabButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === current)))
tabButtons.forEach((b) => b.addEventListener('click', () => {
  current = b.dataset.tab
  try { localStorage.setItem(TAB_KEY, current) } catch (e) {}
  mark()
  showView(current)
}))
tabs.querySelector('#plugin-open').addEventListener('click', () => orca.shell.openExternal(`${DASHBOARD}/#${current}`))
mark()

/* ---- status bar: offline message, retry ---- */
const bar = document.createElement('div')
bar.id = 'plugin-bar'
bar.setAttribute('role', 'status')
bar.hidden = true
bar.innerHTML = '<span class="msg"></span><button type="button" id="plugin-retry">Thử lại</button>'
document.querySelector('.dash').prepend(tabs, bar)
const view = barView(bar, bar.querySelector('.msg'))
bar.querySelector('#plugin-retry').addEventListener('click', () => document.getElementById('refresh').click())

/* ---- /api/data goes through the worker, in chunks (one reply may not pass 1 MiB) ---- */
const unwrap = (out) => (out && Object.keys(out).length === 1 && 'output' in out ? out.output : out)
const request = async (name, input) => unwrap(await orca.plugin.request(name, input, { timeoutMs: 40000 }))
const ask = makeAsk(request)

/* Stale while revalidate: the last snapshot paints at once (a worker round trip lands after the
   page has loaded), then the worker's answer replaces it. localStorage may be missing: then no cache. */
const CACHE = (days) => `team-dashboard-plugin:tasks:${days}` // one snapshot serves all tabs
const cached = (days) => { try { return JSON.parse(localStorage.getItem(CACHE(days))) } catch (e) { return null } }
const remember = (days, data) => { try { localStorage.setItem(CACHE(days), JSON.stringify(data)) } catch (e) {} }
const firstFromCache = !!cached(state.days)

window.fetch = makeFetch({
  real: window.fetch.bind(window), base: DASHBOARD, ask, cached, remember, firstDays: state.days,
  extra: {
    '/api/team/skill': (url) => request('team.skill', { name: url.searchParams.get('name') || '' })
  },
  hasCharts: () => viewHasCharts(document, current), // the tab on screen, not always the Tasks treemap
  ok: () => view.ok(),
  fail: (e, hadCharts) => view.fail(e.code === 'offline' ? e.message + ' Bấm Thử lại sau ít giây.' : `Không tải được dữ liệu (${e.code || 'error'}: ${e.message}).`, hadCharts)
})

/* A frame may refuse history.replaceState; dash.js only uses it to mirror the tab in the hash. */
const replaceState = history.replaceState.bind(history)
history.replaceState = (...args) => { try { replaceState(...args) } catch (e) {} }

const stale = firstFromCache
show(document.getElementById(current))
/* A cached first paint is refreshed right after it, once dash.js finishes that load. */
if (stale) setTimeout(() => document.getElementById('refresh').click(), 0)
