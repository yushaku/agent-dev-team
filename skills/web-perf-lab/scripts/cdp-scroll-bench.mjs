// Scroll benchmark in an already-running, logged-in Chrome/Edge over CDP, with the API list amplified to N items.
// Usage: node cdp-scroll-bench.mjs <browserDataDir> <pageUrl> <urlPart> <itemsPath> <suffixKeys> <sizes e.g. 300,2000,10000> <scrollerSel> <itemSel> [profile]
//   browserDataDir: dir holding DevToolsActivePort, e.g. "$HOME/Library/Application Support/Google/Chrome"
//   itemsPath/suffixKeys: see amplify-xhr.js ("" for itemsPath when the body is the array)
// Prints one JSON line per size: load time, item and DOM node counts, rAF frame stats, optional CPU self-time top 15.
import fs from 'node:fs';
const [dataDir, PAGE, URL_PART, ITEMS_PATH, SUFFIX_KEYS, sizes, SCROLLER, ITEM, prof] = process.argv.slice(2);
if (!ITEM) { console.error('usage: see header'); process.exit(2); }
const port = fs.readFileSync(`${dataDir}/DevToolsActivePort`, 'utf8').split('\n');
const ws = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const amp = fs.readFileSync(new URL('./amplify-xhr.js', import.meta.url), 'utf8')
  .replaceAll('__URL_PART__', URL_PART).replaceAll('__ITEMS_PATH__', ITEMS_PATH).replaceAll('__SUFFIX_KEYS__', SUFFIX_KEYS);
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, s)).result.value;
await send('Page.enable', {}, s);
let scriptId = null;
for (const N of sizes.split(',').map(Number)) {
  if (scriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }, s);
  scriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: amp.replaceAll('__N__', String(N)) }, s)).identifier;
  const t0 = Date.now(); await send('Page.navigate', { url: PAGE }, s);
  let last = -1, stable = 0;
  for (let i = 0; i < 600; i++) { await sleep(250); const c = await ev(`document.querySelectorAll(${JSON.stringify(ITEM)}).length`).catch(() => 0); if (c > 0 && c === last) { if (++stable >= 6) break; } else stable = 0; last = c; }
  const loadMsApprox = Date.now() - t0 - 1500;
  const info = await ev(`JSON.stringify({bench: window.__bench, benchErr: window.__benchErr, items: document.querySelectorAll(${JSON.stringify(ITEM)}).length, domNodes: document.getElementsByTagName('*').length})`);
  if (prof) { await send('Profiler.enable', {}, s); await send('Profiler.setSamplingInterval', { interval: 200 }, s); await send('Profiler.start', {}, s); }
  const frames = await ev(`new Promise(res => { const c = document.querySelector(${JSON.stringify(SCROLLER)}); if (!c) return res('{"error":"no scroller"}'); c.scrollTop = 0;
    const longs = []; const po = new PerformanceObserver(l => l.getEntries().forEach(e => longs.push(e.duration))); po.observe({type:'longtask'});
    const d = []; let last = performance.now(), k = 0;
    const f = (t) => { d.push(t - last); last = t; c.scrollTop += 60; if (++k < 150) requestAnimationFrame(f); else { po.disconnect(); d.shift(); d.sort((a,b)=>a-b);
      res(JSON.stringify({medianFrameMs:+d[d.length>>1].toFixed(1), p95FrameMs:+d[Math.floor(d.length*.95)].toFixed(1), maxFrameMs:+d[d.length-1].toFixed(1), framesOver20ms:d.filter(x=>x>20).length, of:d.length, longTasks:longs.length})); } };
    requestAnimationFrame(f); })`);
  let top = null;
  if (prof) {
    const { profile } = await send('Profiler.stop', {}, s); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map();
    profile.samples.forEach((sid, i) => { const cf = byId.get(sid).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`; self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0)); });
    top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, us]) => `${(us / 1000).toFixed(1)}ms ${k}`);
  }
  console.log(JSON.stringify({ N, loadMsApprox, info: JSON.parse(info), frames: JSON.parse(frames), top }));
}
await send('Target.closeTarget', { targetId });
ws.close();
