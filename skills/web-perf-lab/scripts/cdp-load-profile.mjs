// Profile a page LOAD in an already logged-in Chrome/Edge over CDP, with an API list amplified to N items.
// Usage: node cdp-load-profile.mjs <browserDataDir> <pageUrl> <urlPart> <itemsPath> <suffixKeys> <N> <itemSel>
//   browserDataDir: dir holding DevToolsActivePort, e.g. "$HOME/Library/Application Support/Google/Chrome"
//   itemsPath/suffixKeys: see amplify-xhr.js ("" for itemsPath when the body is the array)
// Warms once (dev compile), then profiles a reload: marks plus self and inclusive time per function.
import fs from 'node:fs';

const [dataDir, URL_, URL_PART, ITEMS_PATH, SUFFIX_KEYS, N_, SEL] = process.argv.slice(2);
if (!SEL) { console.error('usage: see header'); process.exit(2); }
const N = Number(N_);
const port = fs.readFileSync(`${dataDir}/DevToolsActivePort`, 'utf8').split('\n');
const ws = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

const count = `document.querySelectorAll(${JSON.stringify(SEL)}).length`;
const marks = `(() => {
  window.__loadMarks = { longTasks: [] };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loadMarks.longTasks.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
  const mo = new MutationObserver(() => { const n = ${count}; if (n && !window.__loadMarks.firstItems) window.__loadMarks.firstItems = Math.round(performance.now()); if (n) window.__loadMarks.lastItemChange = Math.round(performance.now()); });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
})();`;
const amp = fs.readFileSync(new URL('./amplify-xhr.js', import.meta.url), 'utf8')
  .replaceAll('__URL_PART__', URL_PART).replaceAll('__ITEMS_PATH__', ITEMS_PATH).replaceAll('__SUFFIX_KEYS__', SUFFIX_KEYS).replaceAll('__N__', String(N));

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s)).result.value;
await send('Page.enable', {}, s);
await send('Page.addScriptToEvaluateOnNewDocument', { source: marks }, s);
await send('Page.addScriptToEvaluateOnNewDocument', { source: amp }, s);
// Warm load first so dev-server compilation is not profiled.
await send('Page.navigate', { url: URL_ }, s);
for (let i = 0; i < 120; i++) { await sleep(500); if ((await ev(count).catch(() => 0)) >= N) break; }

await send('Profiler.enable', {}, s);
await send('Profiler.setSamplingInterval', { interval: 250 }, s);
await send('Profiler.start', {}, s);
await send('Page.navigate', { url: URL_ }, s);
let last = -1, stable = 0;
for (let i = 0; i < 400; i++) { await sleep(250); const n = await ev(count).catch(() => 0); if (n > 0 && n === last) { if (++stable >= 8) break; } else stable = 0; last = n; }
const { profile } = await send('Profiler.stop', {}, s);
const info = JSON.parse(await ev(`JSON.stringify({ ...window.__loadMarks, longTasks: window.__loadMarks.longTasks.length, bench: window.__bench, benchErr: window.__benchErr, api: Math.round((performance.getEntriesByType('resource').find(e => e.name.includes(${JSON.stringify(URL_PART)})) || {}).responseEnd || 0), items: ${count}, domNodes: document.getElementsByTagName('*').length })`));

// Self and inclusive time per function (inclusive counts each function once per stack).
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const selfUs = new Map(); profile.samples.forEach((sid, i) => selfUs.set(sid, (selfUs.get(sid) || 0) + (profile.timeDeltas[i] || 0)));
const key = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-1)[0]}:${cf.lineNumber}`; };
const self = new Map(), incl = new Map();
for (const [nid, us] of selfUs) {
  const k0 = key(nodes.get(nid)); self.set(k0, (self.get(k0) || 0) + us);
  const seen = new Set(); let cur = nid;
  while (cur !== undefined) { const k = key(nodes.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } cur = parent.get(cur); }
}
const top = (map, n, f = () => true) => [...map.entries()].filter(([k]) => f(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${(us / 1000).toFixed(0)}ms ${k}`);
console.log(JSON.stringify({ N, ...info }));
console.log('--- self top 20\n' + top(self, 20).join('\n'));
console.log('--- inclusive top 40 (named functions)\n' + top(incl, 40, (k) => !k.startsWith('(')).join('\n'));
await send('Target.closeTarget', { targetId });
ws.close();
