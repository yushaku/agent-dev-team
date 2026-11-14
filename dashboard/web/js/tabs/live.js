/* "Đang chạy" tab: Orchestrators coordinating the team right now, from GET /api/live every 3 s.
   Two views of one snapshot: the hub map (default) and the time lanes ("Chi tiết").
   Pure helpers (filterRuns, diffSnapshots, countsOf, ...) are exported for tests/test_frontend.mjs. */
import * as C from "../lib/charts.js";
import { $, esc, A, cut } from "../lib/charts.js";

const NAMES = { claude: "Claude", codex: "Codex", copilot: "Copilot", cursor: "Cursor", hermes: "Hermes" };
const DONE = ["completed", "failed", "cancelled", "canceled"];
const STATE_TEXT = { working: "đang làm", idle: "ngồi chờ", released: "đã nghỉ" };
const POLL_MS = 3000, NOW_AT = 90, HUB_LOG = 8, LANE_LOG = 12, MAX_SATS = 14, FRESH_GATE = 90;
const VIEW_KEY = "team-app:live-view";

export const agentName = a => NAMES[a] || "";
const agentCls = a => "ag-" + (NAMES[a] ? a : "none");
const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n || 0));
export const fmtDur = s => { s = Math.round(s); if (s < 60) return s + " giây"; const m = Math.floor(s / 60), r = s % 60; return m < 60 ? m + " phút" + (r ? " " + r + " giây" : "") : Math.floor(m / 60) + " giờ " + (m % 60) + " phút"; };
const p2 = n => String(n).padStart(2, "0");
export const clock = t => { const d = new Date(t * 1000); return p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds()); };
const hhmm = t => { const d = new Date(t * 1000); return p2(d.getHours()) + ":" + p2(d.getMinutes()); };
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const lines = (...xs) => xs.filter(x => x != null && x !== "");
const labelled = (k, v) => v == null || v === "" ? null : k + ": " + v;
export const workerKey = w => w.dispatch_id || w.task_id;

/* ---------- pure helpers ---------- */
/* Global filters: Repo, Agent, Run. An Agent filter keeps only that agent's workers (and Runs it works in or orchestrates). */
export function filterRuns(runs, f = {}) {
  const out = [];
  for (const r of runs || []) {
    if (f.runF && r.id !== f.runF) continue;
    if (f.repo && r.repo !== f.repo) continue;
    if (!f.agent) { out.push(r); continue; }
    const workers = r.workers.filter(w => w.agent === f.agent);
    if (!workers.length && r.orchestrator?.agent !== f.agent) continue;
    const ids = new Set(workers.map(w => w.task_id));
    out.push({ ...r, workers, tasks: r.tasks.filter(t => ids.has(t.id) || !DONE.includes(t.status) && !t.agent),
      events: r.events.filter(e => !e.agent || e.agent === f.agent) });
  }
  return out;
}

/* What changed between two snapshots: drives spawn / pulse / fade animations. The first snapshot replays nothing. */
export function diffSnapshots(prev, next) {
  const d = { spawned: [], reported: [], released: [], events: [], newRuns: [] };
  if (!prev || !next) return d;
  const before = new Map(prev.runs.map(r => [r.id, r]));
  for (const r of next.runs) {
    const p = before.get(r.id);
    if (!p) d.newRuns.push(r.id);
    const old = new Map((p ? p.workers : []).map(w => [workerKey(w), w]));
    for (const w of r.workers) {
      const o = old.get(workerKey(w));
      if (!o) { if (w.status !== "released") d.spawned.push({ run: r.id, key: workerKey(w) }); continue; }
      if (o.status === "working" && w.status !== "working") d.reported.push({ run: r.id, key: workerKey(w) });
      if (o.status !== "released" && w.status === "released") d.released.push({ run: r.id, key: workerKey(w) });
    }
    const seen = new Set((p ? p.events : []).map(e => e.id));
    for (const e of r.events) if (!seen.has(e.id)) d.events.push(e);
  }
  d.events.sort((a, b) => a.t - b.t);
  return d;
}

export function runTokens(r) { return r.tokens || r.tasks.reduce((n, t) => n + (t.tokens || 0), 0); }

export function countsOf(runs) {
  const c = { orch: runs.length, work: 0, wait: 0, gate: 0, idle: 0, released: 0, tokens: 0 };
  for (const r of runs) {
    const working = new Set(r.workers.filter(w => w.status === "working").map(w => w.task_id));
    c.wait += r.tasks.filter(t => !DONE.includes(t.status) && !working.has(t.id)).length;
    c.gate += r.gates.filter(g => g.status !== "resolved").length;
    for (const w of r.workers) c[w.status === "working" ? "work" : w.status]++;
    c.tokens += runTokens(r);
  }
  return c;
}

export const orderWorkers = r => [...r.workers].sort((a, b) => (a.dispatched_at || 0) - (b.dispatched_at || 0) || String(workerKey(a)).localeCompare(String(workerKey(b))));

/* Keep every live worker and the most recent released ones, so a long Run does not crowd its orbit. */
export function visibleWorkers(r, max = MAX_SATS) {
  const all = orderWorkers(r);
  if (all.length <= max) return { shown: all, hidden: 0 };
  const rest = all.filter(w => w.status === "released").sort((a, b) => (b.released_at || 0) - (a.released_at || 0));
  const drop = new Set(rest.slice(Math.max(0, max - (all.length - rest.length))));
  return { shown: all.filter(w => !drop.has(w)), hidden: drop.size };
}

/* One cluster per row: the map is as wide as its canvas, so labels keep their size. capY is the caption baseline relative to the hub. */
export function layoutCells(n, W, cellH) {
  return Array.from({ length: n }, (_, i) => {
    const cy = i * cellH + cellH * 0.52;
    return { cx: W / 2, cy, R: Math.min(W / 2 - 80, cellH * 0.32), w: W, capY: i * cellH + 34 - cy };
  });
}

export const satPos = (i, n, R) => {
  const ring = n > 12 && i % 2 ? R * 0.74 : R, a = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / Math.max(n, 1);
  return { x: ring * Math.cos(a), y: ring * Math.sin(a) };
};

export function mergedEvents(runs, limit) {
  return runs.flatMap(r => r.events).sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : -1)).slice(0, limit);
}

/* ---------- mascots ---------- */
const pts = (cx, cy, ro, ri, n, rot) => { const a = []; for (let i = 0; i < n * 2; i++) { const R = i % 2 ? ri : ro, g = rot + Math.PI * i / n; a.push((cx + R * Math.cos(g)).toFixed(1) + "," + (cy + R * Math.sin(g)).toFixed(1)); } return a.join(" "); };
const FACE = (lx, ly, rx, ry, r) => `<g class="face e-open"><circle cx="${lx}" cy="${ly}" r="${r}" fill="var(--crust)"/><circle cx="${rx}" cy="${ry}" r="${r}" fill="var(--crust)"/><circle cx="${lx + 1}" cy="${ly - 1.2}" r="1" fill="var(--text)"/><circle cx="${rx + 1}" cy="${ry - 1.2}" r="1" fill="var(--text)"/></g>`
  + `<g class="face e-sleep"><path d="M${lx - r} ${ly}q${r} ${r} ${2 * r} 0M${rx - r} ${ry}q${r} ${r} ${2 * r} 0" stroke="var(--crust)" stroke-width="2" fill="none" stroke-linecap="round"/></g>`
  + `<g class="face e-happy"><path d="M${lx - r} ${ly + 1}q${r} ${-r * 1.7} ${2 * r} 0M${rx - r} ${ry + 1}q${r} ${-r * 1.7} ${2 * r} 0" stroke="var(--crust)" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
const MOUTH = (x, y, w) => `<path class="face" d="M${x - w} ${y}q${w} ${w} ${2 * w} 0" stroke="var(--crust)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
const WING = "M18 30C8 20 2 22 1 25C5 26 4 29 8 31C6 33 9 35 12 36C10 38 14 40 18 38Z";
const SHAPES = {
  claude: () => `<polygon class="body" points="${pts(32, 32, 29, 17, 8, -Math.PI / 2)}" stroke-width="6" stroke-linejoin="round"/><circle class="acc" cx="19" cy="38" r="3.2" fill="var(--peach)"/><circle class="acc" cx="45" cy="38" r="3.2" fill="var(--peach)"/><circle class="acc" cx="32" cy="10" r="2.6" fill="var(--peach)"/>${FACE(25, 29, 39, 29, 3.3)}${MOUTH(32, 37, 4)}`,
  codex: () => `<polygon class="body" points="${pts(32, 32, 28, 28, 3, -Math.PI / 2)}" stroke-width="6" stroke-linejoin="round"/><polygon class="acc" points="${pts(32, 32, 19, 19, 3, 0)}" fill="none" stroke="var(--crust)" stroke-opacity=".3" stroke-width="2.5" stroke-linejoin="round"/>${FACE(25, 29, 39, 29, 3.3)}${MOUTH(32, 38, 4)}`,
  copilot: () => `<rect class="body" x="8" y="12" width="48" height="42" rx="20" stroke-width="2"/><rect class="acc" x="3" y="28" width="8" height="14" rx="4" fill="var(--sky)"/><rect class="acc" x="53" y="28" width="8" height="14" rx="4" fill="var(--sky)"/><rect class="acc" x="8" y="27" width="48" height="5" fill="var(--crust)" opacity=".55"/><circle class="acc" cx="23" cy="30" r="10.5" fill="var(--text)" stroke="var(--crust)" stroke-width="3"/><circle class="acc" cx="41" cy="30" r="10.5" fill="var(--text)" stroke="var(--crust)" stroke-width="3"/>${FACE(23, 30, 41, 30, 4)}${MOUTH(32, 46, 5)}`,
  cursor: () => `<polygon class="body" points="32,5 57,19 32,33 7,19" stroke-width="2" stroke-linejoin="round"/><polygon class="body" points="7,19 32,33 32,60 7,46" stroke-width="2" stroke-linejoin="round"/><polygon class="body" points="32,33 57,19 57,46 32,60" stroke-width="2" stroke-linejoin="round"/><polygon class="acc" points="32,5 57,19 32,33 7,19" fill="var(--text)" opacity=".3"/><polygon class="acc" points="32,33 57,19 57,46 32,60" fill="var(--crust)" opacity=".25"/>${FACE(19, 38, 45, 38, 3)}${MOUTH(32, 48, 3.5)}`,
  hermes: () => `<path class="acc" d="${WING}" fill="var(--pink)"/><path class="acc" transform="translate(64 0) scale(-1 1)" d="${WING}" fill="var(--pink)"/><circle class="body" cx="32" cy="36" r="17" stroke-width="2"/><path class="acc" d="M16 32A16 15 0 0 1 48 32Z" fill="var(--pink)"/>${FACE(25, 39, 39, 39, 3.2)}${MOUTH(32, 47, 4)}`,
};
const ZZ = '<text class="zz" x="50" y="8">z z</text>';
const shapeOf = a => (SHAPES[a] || SHAPES.hermes)();
/* Unknown agents get a neutral mascot silhouette (the Hermes body) tinted by .ag-none. */
const svgOf = (a, at = "") => `<svg viewBox="0 0 64 64" aria-hidden="true" ${at}>${shapeOf(a)}${ZZ}</svg>`;
const ORCH = `<svg viewBox="0 0 72 80" aria-hidden="true" ATTR><g class="baton"><line x1="52" y1="50" x2="64" y2="30" stroke="var(--c)" stroke-width="5" stroke-linecap="round"/><line x1="64" y1="30" x2="70" y2="10" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/><circle cx="70" cy="9" r="3" fill="var(--a)"/></g><path class="acc" d="M16 79L21 52Q36 44 51 52L56 79Z" fill="var(--surface1)"/><path class="acc" d="M29 49L36 62L43 49Z" fill="var(--text)"/><path class="acc" d="M29 53L36 57L29 61ZM43 53L36 57L43 61Z" fill="var(--c)"/><circle class="body" cx="36" cy="30" r="17" stroke-width="1"/><path class="acc" d="M21 25Q36 5 51 25Q36 17 21 25Z" fill="var(--a)"/>${FACE(30, 31, 42, 31, 3.2)}${MOUTH(36, 40, 4)}<text class="zz" x="60" y="12">z z</text></svg>`;
const orchSvg = (at = "") => ORCH.replace("ATTR", at);
const sized = (s, x, y, w, h) => s.replace("<svg viewBox", `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox`);
const mood = (a, m, size, cls = "") => `<span class="mas mas-${size} ${agentCls(a)} ${m} ${cls}">${svgOf(a)}</span>`;
const orchMood = (a, m, size) => `<span class="mas mas-${size} ${agentCls(a)} ${m}">${orchSvg()}</span>`;
const setMood = (g, m) => { g.classList.remove("sleep", "happy", "work", "ghost"); if (m) g.classList.add(m); };

/* ---------- state ---------- */
let snap = null, loaded = false, err = "", mounted = false, inflight = false, pollTimer = null, laneTimer = null;
let fresh = new Set(), lastFetch = 0, laneRefs = [], laneSig = "", lanePast = 0;
let view = "hub";
const fixture = () => typeof location !== "undefined" && /[?&]live-fixture/.test(location.search || "");
const visible = () => { const v = $("#tk-dang-chay"); return !!v && !v.hidden && (typeof document === "undefined" || document.visibilityState !== "hidden"); };
const filters = () => ({ repo: C.state.repo, agent: C.state.agent, runF: C.state.runF });
const shownRuns = () => filterRuns(snap ? snap.runs : [], filters());
const taskOf = (r, w) => r.tasks.find(t => t.id === w.task_id);

/* ---------- tooltips ---------- */
function workerTip(r, w) {
  const t = taskOf(r, w) || {};
  const dur = t.started ? (t.ended || (w.status === "working" ? snapNow() : 0)) - t.started : 0;
  return lines(t.title, labelled("Vai", t.role), labelled("Agent", agentName(w.agent)), "Trạng thái: " + STATE_TEXT[w.status],
    labelled("Token", t.tokens ? fmtTok(t.tokens) : ""), labelled("Thời lượng", dur > 0 ? fmtDur(dur) : ""));
}
const snapNow = () => snap ? snap.generated_at : Date.now() / 1000;
const runTip = r => lines("Orchestrator" + (r.orchestrator ? " " + agentName(r.orchestrator.agent) : ""), labelled("Run", cut(r.objective, 60)),
  labelled("Repo", r.repo), "Việc xong: " + r.tasks.filter(t => DONE.includes(t.status)).length + "/" + r.tasks.length,
  labelled("Token", runTokens(r) ? fmtTok(runTokens(r)) : ""));
const eventTip = (r, e) => lines(e.text, "Lúc " + clock(e.t), labelled("Repo", r && r.repo));

/* ---------- mount ---------- */
function mount() {
  if (mounted) return;
  const root = $("#live-root");
  if (!root) return;
  mounted = true;
  try { view = localStorage.getItem(VIEW_KEY) === "lanes" ? "lanes" : "hub"; } catch (e) {}
  root.innerHTML = `
  <div class="live-hub" id="live-hub">
    <div class="live-canvas"><svg id="live-map" viewBox="0 0 640 620" role="img" aria-label="Sơ đồ Orchestrator và các agent"></svg></div>
    <aside class="live-side">
      <div class="live-panel"><h4 class="live-h">Tổng quan</h4>
        <div class="live-tiles"><div class="live-tile w"><b id="c-work">0</b><span>đang làm</span><small></small></div><div class="live-tile q"><b id="c-wait">0</b><span>chờ</span><small id="c-gate"></small></div><div class="live-tile r"><b id="c-rel">0</b><span>đã nghỉ</span><small id="c-idle"></small></div></div>
        <div class="live-tokrow"><span>Token đã dùng</span><b id="c-tok">0</b></div></div>
      <div class="live-panel"><h4 class="live-h">Orchestrator</h4><div id="live-runs"></div></div>
      <div class="live-panel"><h4 class="live-h">Đang diễn ra</h4><ol class="live-log" id="live-log"></ol></div>
    </aside>
  </div>
  <div class="live-lanes" id="live-lanes" hidden>
    <div class="live-sumbar"><div class="chip-s"><b id="s-orch">0</b>Orchestrator</div><div class="chip-s w"><b id="s-work">0</b>đang làm</div><div class="chip-s g"><b id="s-gate">0</b>chờ PO</div><div class="chip-s"><b id="s-idle">0</b>ngồi chờ</div><div class="chip-s"><b id="s-rel">0</b>đã nghỉ</div><div class="chip-s d"><b id="s-tok">0</b>token</div>
      <div class="live-legend" id="live-legend"></div></div>
    <div class="live-wrap"><div class="live-axisrow"><div class="lab0">Agent và Orchestrator</div><div class="axis" id="live-axis"></div></div><div class="live-lanebox"><div class="live-grid" id="live-grid"></div><div id="live-groups"></div></div></div>
    <div class="live-panel live-logwrap"><h4 class="live-h"><i class="live-blink"></i>Đang diễn ra</h4><ol class="live-log cols" id="live-log2"></ol></div>
  </div>
  <div class="live-empty" id="live-empty" hidden>${emptyHtml()}</div>`;
  $("#live-legend").innerHTML = LEG.map(l => `<span><i class="bub ${l[0]}">${bubIcon(l[0])}</i>${l[1]}</span>`).join("");
  $("#live-toggle").addEventListener("click", () => { view = view === "hub" ? "lanes" : "hub"; try { localStorage.setItem(VIEW_KEY, view); } catch (e) {} paint(null); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") renderLive(); else stopTimers(); });
}

function emptyHtml() {
  const names = ["claude", "codex", "copilot", "cursor", "hermes"];
  const sats = names.map((a, i) => { const g = -Math.PI / 2 + i * 2 * Math.PI / 5, x = 210 + 150 * Math.cos(g) - 30, y = 170 + 118 * Math.sin(g) - 30;
    return `<g class="mas ${agentCls(a)} sleep">${sized(svgOf(a), x.toFixed(1), y.toFixed(1), 60, 60)}</g>`; }).join("");
  return `<svg viewBox="0 0 420 340" role="img" aria-label="Orchestrator và các agent đang ngủ"><ellipse class="ring" cx="210" cy="170" rx="180" ry="140"/>${sats}<g class="mas ag-claude sleep">${sized(orchSvg(), 156, 112, 108, 120)}</g></svg>
  <h4>Không có Run nào đang chạy</h4><p>Orchestrator đang ngủ, các agent nằm nghỉ quanh trạm. Khi có Run mới, các vệ tinh sẽ lần lượt sáng lên.</p>`;
}

/* ---------- polling ---------- */
async function poll() {
  if (inflight) return;
  inflight = true; lastFetch = Date.now();
  try {
    const r = await fetch("/api/live" + (fixture() ? "?fixture=1" : ""), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const next = await r.json();
    const diff = diffSnapshots(snap, next);
    snap = next; loaded = true; err = "";
    paint(diff);
  } catch (e) {
    err = e.message; paint(null);
  } finally { inflight = false; }
}
function stopTimers() { clearInterval(pollTimer); clearInterval(laneTimer); pollTimer = laneTimer = null; }
/* Entry point from dash.js render(): polls only while this tab and the page are visible. */
export function renderLive() {
  mount();
  if (!mounted) return;
  if (!visible()) { stopTimers(); return; }
  if (!pollTimer) pollTimer = setInterval(() => { if (visible()) poll(); }, POLL_MS);
  if (!laneTimer) laneTimer = setInterval(() => { if (visible() && view === "lanes" && snap) layoutLanes(); }, 1000);
  if (snap) paint(null);
  if (!snap || Date.now() - lastFetch > 1000) poll();
}

/* ---------- paint ---------- */
function paint(diff) {
  if (!mounted) return;
  const runs = shownRuns(), empty = loaded && !runs.length;
  const warn = $("#live-warning"), msg = err ? "Không tải được dữ liệu đang chạy (" + err + "). Đang hiện lần cập nhật trước."
    : snap && snap.available === false ? "Không gọi được lệnh orca" + (snap.error ? " (" + snap.error + ")" : "") + ". Các tab khác vẫn đúng." : snap && snap.error || "";
  warn.hidden = !msg; warn.textContent = msg;
  $("#live-updated").textContent = snap ? "Cập nhật " + clock(snap.generated_at) : "";
  $("#live-toggle").hidden = empty;
  $("#live-toggle").textContent = view === "hub" ? "Chi tiết" : "Sơ đồ";
  $("#live-toggle").setAttribute("aria-pressed", String(view === "lanes"));
  $("#live-hub").hidden = empty || view !== "hub";
  $("#live-lanes").hidden = empty || view !== "lanes";
  $("#live-empty").hidden = !empty;
  if (!loaded || empty) return;
  fresh = new Set(diff ? diff.events.map(e => e.id) : []);
  if (view === "hub") paintHub(runs, diff); else paintLanes(runs);
}

const logHtml = (runs, limit) => mergedEvents(runs, limit).map(e => {
  const r = runs.find(x => x.id === e.run);
  return `<li class="${fresh.has(e.id) && !reduced() ? "new" : ""}" data-type="${e.type}"${A({ tip: eventTip(r, e) })}><span class="lt">${clock(e.t)}</span><i class="ld"></i><span class="lx">${esc(e.text)}</span></li>`;
}).join("");
function paintLog(id, runs, limit) {
  const el = $(id), html = logHtml(runs, limit);
  if (el.dataset.sig !== html) { el.innerHTML = html || '<li class="none">Chưa có sự kiện nào</li>'; el.dataset.sig = html; }
}
const setText = (id, v) => { const x = $(id); if (x && x.textContent !== String(v)) x.textContent = v; };

/* ---------- hub view ---------- */
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent, html) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
const clusters = new Map();
const CELL = 620, MAP_W = 640;

function buildCluster(r) {
  const map = $("#live-map"), g = el("g", { class: "lv-cl" }, map);
  const cl = { g, orbit: el("circle", { class: "lv-orbit" }, g) };
  el("circle", { class: "lv-orbit in", r: 72 }, g);
  cl.cap1 = el("text", { class: "lv-cap1" }, g); cl.cap2 = el("text", { class: "lv-cap2" }, g); cl.cap3 = el("text", { class: "lv-cap3" }, g);
  cl.links = el("g", {}, g); cl.dots = el("g", {}, g);
  cl.gate = el("g", { class: "lv-gate" }, g);
  el("line", { class: "glink", x1: 0, y1: -58, x2: 0, y2: -100 }, cl.gate); el("rect", { x: -62, y: -124, width: 124, height: 26, rx: 13 }, cl.gate);
  cl.gt = el("text", { x: 0, y: -107 }, cl.gate);
  cl.pulses = el("g", {}, g);
  cl.sats = el("g", {}, g);
  cl.hub = el("g", { class: "lv-hub" }, g);
  el("circle", { class: "hring", r: 60 }, cl.hub);
  cl.hm = el("g", { class: "mas work" }, cl.hub, sized(orchSvg(), -46, -52, 92, 102));
  cl.sat = new Map(); cl.link = new Map(); cl.dot = new Map();
  clusters.set(r.id, cl);
  return cl;
}

function pulse(cl, from, to, color, ms, after) {
  if (reduced() || !cl.pulses.animate) { if (after) after(); return; }
  const p = el("circle", { r: 6, class: "lv-pulse" }, cl.pulses);
  p.style.fill = color;
  const a = p.animate([{ transform: `translate(${from.x}px,${from.y}px)` }, { transform: `translate(${to.x}px,${to.y}px)` }], { duration: ms, easing: "ease-in-out", fill: "forwards" });
  a.onfinish = () => { p.remove(); if (after) after(); };
}
function ripple(cl) {
  if (reduced() || !cl.pulses.animate) return;
  const r = el("circle", { class: "lv-ripple", r: 60 }, cl.pulses);
  r.animate([{ transform: "scale(1)", opacity: 0.9 }, { transform: "scale(1.35)", opacity: 0 }], { duration: 700 }).onfinish = () => r.remove();
}

function updateSat(cl, r, w, pos, spawning) {
  const key = workerKey(w);
  let g = cl.sat.get(key);
  if (!g) {
    g = el("g", { class: `lv-sat ${agentCls(w.agent)}` }, cl.sats);
    g.innerHTML = `<g class="pop${spawning ? " pre" : ""}"><circle class="halo" r="38"/><circle class="base" r="33"/><g class="mas ${agentCls(w.agent)}">${sized(svgOf(w.agent), -26, -26, 52, 52)}</g></g><text class="l1" y="50"></text><text class="l2" y="63"></text>`;
    cl.sat.set(key, g);
    cl.link.set(key, el("line", { class: "lv-link" }, cl.links));
    g.style.transition = "none"; g.style.transform = `translate(${pos.x}px,${pos.y}px)`; g.getBoundingClientRect(); g.style.transition = "";
  }
  g.style.transform = `translate(${pos.x.toFixed(1)}px,${pos.y.toFixed(1)}px)`;
  const st = w.status, t = taskOf(r, w);
  g.setAttribute("class", `lv-sat ${agentCls(w.agent)} ${st === "working" ? "work" : st}`);
  setMood(g.querySelector(".mas"), st === "working" ? "work" : st === "released" ? "ghost" : "sleep");
  g.querySelector(".l1").textContent = cut((t && t.role) || agentName(w.agent) || "worker", 22);
  g.querySelector(".l2").textContent = lines(agentName(w.agent), STATE_TEXT[st]).join(" · ");
  g.setAttribute("data-tip", workerTip(r, w).join("\n"));
  const ln = cl.link.get(key);
  ln.setAttribute("class", `lv-link ${agentCls(w.agent)} ${st === "working" ? "work" : st}`);
  ln.setAttribute("x2", pos.x.toFixed(1)); ln.setAttribute("y2", pos.y.toFixed(1));
  return g;
}

function paintHub(runs, diff) {
  const map = $("#live-map"), cells = layoutCells(runs.length, MAP_W, CELL), animate = !!diff && !reduced();
  map.setAttribute("viewBox", `0 0 ${MAP_W} ${runs.length * CELL}`);
  const ids = new Set(runs.map(r => r.id));
  for (const [id, cl] of clusters) if (!ids.has(id)) { cl.g.remove(); clusters.delete(id); }
  const spawned = new Set(diff ? diff.spawned.map(s => s.run + "|" + s.key) : []);
  runs.forEach((r, i) => {
    const cl = clusters.get(r.id) || buildCluster(r), cell = cells[i];
    cl.g.style.transform = `translate(${cell.cx.toFixed(1)}px,${cell.cy.toFixed(1)}px)`;
    cl.orbit.setAttribute("r", cell.R.toFixed(1));
    cl.cap1.setAttribute("y", cell.capY); cl.cap2.setAttribute("y", cell.capY + 17); cl.cap3.setAttribute("y", cell.capY + 33);
    const open = r.tasks.filter(t => !DONE.includes(t.status)), working = r.workers.some(w => w.status === "working");
    const pending = r.gates.find(g => g.status !== "resolved");
    const approved = !pending && r.gates.filter(g => g.resolved && snapNow() - g.resolved < FRESH_GATE).length;
    const orchName = r.orchestrator ? agentName(r.orchestrator.agent) : "";
    cl.cap1.textContent = cut(lines("Orchestrator" + (orchName ? " " + orchName : ""), r.repo).join(" · "), 48);
    cl.cap2.textContent = cut(r.objective, Math.floor(cell.w / 7.5));
    cl.cap3.textContent = pending ? "Chờ PO duyệt" : working ? "Đang chạy" : open.length ? "Chờ việc" : "Ngồi chờ";
    cl.hub.setAttribute("class", `lv-hub ${agentCls(r.orchestrator && r.orchestrator.agent)}${working ? " run" : ""}`);
    cl.hub.setAttribute("data-tip", runTip(r).join("\n"));
    setMood(cl.hm, working || open.length ? "work" : "sleep");
    cl.gate.setAttribute("class", `lv-gate${pending ? " pending" : approved ? " ok" : " off"}`);
    cl.gt.textContent = pending ? "Chờ PO duyệt" : "PO đã duyệt";
    if (pending) cl.gate.setAttribute("data-tip", lines(pending.question, "Mở lúc " + clock(pending.created)).join("\n"));
    const { shown, hidden } = visibleWorkers(r), keys = new Set();
    shown.forEach((w, n) => {
      const key = workerKey(w), pos = satPos(n, shown.length, cell.R), spawning = animate && spawned.has(r.id + "|" + key);
      const g = updateSat(cl, r, w, pos, spawning);
      keys.add(key);
      if (spawning) {
        pulse(cl, { x: 0, y: 0 }, pos, "var(--" + (NAMES[w.agent] ? w.agent : "overlay2") + ")", 650,
          () => g.querySelector(".pop").classList.remove("pre"));
        setTimeout(() => g.querySelector(".pop").classList.remove("pre"), 900);
      }
    });
    for (const [key, g] of cl.sat) if (!keys.has(key)) { g.remove(); cl.sat.delete(key); cl.link.get(key).remove(); cl.link.delete(key); }
    if (hidden) cl.cap3.textContent += " · " + hidden + " đã nghỉ được ẩn";
    /* waiting tasks sit on the inner ring until a worker takes them */
    const wait = open.filter(t => !r.workers.some(w => w.task_id === t.id && w.status === "working")), tk = new Set();
    wait.forEach((t, n) => {
      const a = (-60 + 24 * n) * Math.PI / 180, x = 72 * Math.cos(a), y = 72 * Math.sin(a);
      let d = cl.dot.get(t.id);
      if (!d) { d = el("circle", { class: "lv-dot", r: 6 }, cl.dots); cl.dot.set(t.id, d); }
      d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      d.setAttribute("data-tip", lines(t.title, labelled("Vai", t.role), "Trạng thái: chờ giao").join("\n"));
      tk.add(t.id);
    });
    for (const [id, d] of cl.dot) if (!tk.has(id)) { d.remove(); cl.dot.delete(id); }
  });
  if (diff) {
    for (const s of diff.reported) { const cl = clusters.get(s.run), g = cl && cl.sat.get(s.key); if (g) pulse(cl, posOf(g), { x: 0, y: 0 }, "var(--green)", 650, () => ripple(cl)); }
    for (const e of diff.events) { const cl = clusters.get(e.run);
      if (!cl) continue;
      if (e.type === "ask") {
        const w = runs.find(r => r.id === e.run).workers.find(x => x.task_id === e.task), g = w && cl.sat.get(workerKey(w));
        if (g) pulse(cl, posOf(g), { x: 0, y: 0 }, "var(--peach)", 600);
      }
      if (e.type === "gate") ripple(cl); }
  }
  const c = countsOf(runs);
  setText("#c-work", c.work); setText("#c-wait", c.wait); setText("#c-rel", c.released);
  setText("#c-gate", c.gate ? `trong đó ${c.gate} chờ PO` : ""); setText("#c-idle", c.idle ? `${c.idle} ngồi chờ` : "");
  setText("#c-tok", c.tokens ? fmtTok(c.tokens) : "0");
  $("#live-runs").innerHTML = runs.map(r => {
    const pendingGate = r.gates.some(g => g.status !== "resolved"), tok = runTokens(r), done = r.tasks.filter(t => DONE.includes(t.status)).length;
    const work = r.workers.some(w => w.status === "working");
    return `<div class="live-runrow ${agentCls(r.orchestrator && r.orchestrator.agent)}"${A({ tip: runTip(r) })}>${orchMood(r.orchestrator && r.orchestrator.agent, work ? "work" : "sleep", "sm")}<div class="i"><div class="n">${esc(lines(r.repo, cut(r.objective, 60)).join(" · "))}</div><div class="m">${done}/${r.tasks.length} việc xong${tok ? " · " + fmtTok(tok) + " token" : ""}</div></div><span class="st${pendingGate ? " gate" : " run"}">${pendingGate ? "Chờ PO" : "Đang chạy"}</span></div>`;
  }).join("");
  paintLog("#live-log", runs, HUB_LOG);
}
function posOf(g) { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(g.style.transform || ""); return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 }; }

/* ---------- lanes view ---------- */
const ICON = { give: '<path d="M2 6h7M6 3l3 3-3 3"/>', report: '<path d="M2.5 6.5l2.5 2.5L10 3.5"/>', ask: '<path d="M2 3h8v5H6l-2 2V8H2z"/>', gate: '<path d="M3 6h6v4.5H3zM4 6V4.5a2 2 0 0 1 4 0V6"/>', ok: '<path d="M2.5 6.5l2.5 2.5L10 3.5"/>', rest: '<path d="M9.5 7.5A4 4 0 1 1 4.5 2.5a3 3 0 0 0 5 5z"/>', sp: "" };
const LEG = [["give", "giao task"], ["report", "báo cáo"], ["ask", "hỏi"], ["gate", "cổng PO"], ["rest", "nghỉ"]];
const BUB = { dispatch: "give", done: "report", ask: "ask", release: "rest", gate: "gate", gate_ok: "ok", split: "sp" };
const bubIcon = t => ICON[t] ? `<svg viewBox="0 0 12 12" aria-hidden="true">${ICON[t]}</svg>` : "";
let win = 1800;
const X = (t, now) => NOW_AT - (now - t) / win * NOW_AT;
/* Time window of the lanes: the shortest of 5, 10, 15 and 30 minutes that holds everything since the earliest event. */
export function windowFor(span) { return [300, 600, 900, 1800].find(w => span * 1.1 <= w) || 1800; }
export const tickStep = w => w <= 600 ? 60 : w <= 900 ? 180 : 300;

function paintLanes(runs) {
  const sig = JSON.stringify(runs.map(r => [r.id, r.tasks.map(t => t.id + t.status), r.workers.map(w => workerKey(w) + w.status), r.gates.map(g => g.id + g.status), r.events.length, r.events.at(-1)?.id]));
  if (sig !== laneSig) { laneSig = sig; buildLanes(runs); }
  lanePast = Math.min(Date.now() / 1000, ...runs.flatMap(r => [r.created || Infinity, ...r.events.map(e => e.t)]));
  layoutLanes();
  const c = countsOf(runs);
  setText("#s-orch", c.orch); setText("#s-work", c.work); setText("#s-gate", c.gate); setText("#s-idle", c.idle); setText("#s-rel", c.released); setText("#s-tok", c.tokens ? fmtTok(c.tokens) : "0");
  paintLog("#live-log2", runs, LANE_LOG);
}

function bubble(e, r) {
  const t = BUB[e.type];
  return `<i class="bub ${t}" data-t="${e.t}"${A({ tip: eventTip(r, e) })}>${bubIcon(t)}</i>`;
}
function buildLanes(runs) {
  const maxTok = Math.max(1, ...runs.flatMap(r => r.tasks.map(t => t.tokens || 0)));
  $("#live-groups").innerHTML = runs.map(r => {
    const orchA = r.orchestrator && r.orchestrator.agent, work = r.workers.some(w => w.status === "working"), pending = r.gates.some(g => g.status !== "resolved");
    const lastWorker = new Map(orderWorkers(r).map(w => [w.task_id, workerKey(w)]));
    const orchEv = r.events.filter(e => ["split", "gate", "gate_ok"].includes(e.type));
    const gates = r.gates.filter(g => g.created).map(g => `<div class="gbar${g.status === "resolved" ? " done" : ""}" data-a="${g.created}" data-b="${g.resolved || ""}">${g.status === "resolved" ? "PO đã duyệt" : "Chờ PO duyệt"}</div>`).join("");
    const orchLane = `<div class="lane orch ${agentCls(orchA)}"><div class="lab"${A({ tip: runTip(r) })}>${orchMood(orchA, work ? "work" : "sleep", "xs")}<div class="n"><b>${esc("Orchestrator" + (orchA ? " " + agentName(orchA) : ""))}</b><i>${esc(lines(r.repo, cut(r.objective, 60)).join(" · "))}</i></div><span class="s">${pending ? "chờ PO" : "đang chạy"}</span></div><div class="track"><div class="pres" data-a="${r.created || ""}"></div>${gates}${orchEv.map(e => bubble(e, r)).join("")}</div></div>`;
    const lanes = orderWorkers(r).map(w => {
      const t = taskOf(r, w) || {}, key = workerKey(w), st = w.status;
      const evs = r.events.filter(e => e.task === w.task_id && ["dispatch", "done", "ask", "release"].includes(e.type) && lastWorker.get(w.task_id) === key);
      const start = w.dispatched_at || t.started || r.created, end = st === "working" ? "" : t.ended || w.released_at || "";
      const h = 20 + 50 * Math.sqrt((t.tokens || 0) / maxTok);
      return `<div class="lane ${agentCls(w.agent)}${st === "working" ? " w" : st === "released" ? " rel" : ""}"><div class="lab"${A({ tip: workerTip(r, w) })}>${mood(w.agent, st === "working" ? "work" : st === "released" ? "ghost" : "sleep", "xs")}<div class="n"><b>${esc(agentName(w.agent) || "Worker")}</b><i>${esc(t.role || cut(t.title, 28))}</i></div><span class="s">${STATE_TEXT[st]}</span></div>
        <div class="track"><div class="idle" data-a="${end}" data-b="${w.released_at || ""}"></div><div class="bar" data-a="${start}" data-b="${end}" data-lab="${esc(lines(t.role, t.tokens ? fmtTok(t.tokens) : "").join(" · "))}" style="--h:${h.toFixed(0)}%"${A({ tip: workerTip(r, w) })}><span></span></div>${evs.map(e => bubble(e, r)).join("")}</div></div>`;
    }).join("");
    return `<div class="grp">${orchLane}${lanes}</div>`;
  }).join("");
  laneRefs = [...document.querySelectorAll("#live-groups [data-a], #live-groups .bub")];
}

function layoutLanes() {
  const now = Date.now() / 1000;
  win = windowFor(now - lanePast);
  const put = (e, a, b, minW) => {
    const l = Math.max(0, X(a, now)), r = Math.min(NOW_AT, b == null ? NOW_AT : X(b, now));
    e.style.display = r < 0 || r <= l && minW == null ? "none" : "";
    e.style.left = l.toFixed(2) + "%"; e.style.width = Math.max(minW || 0, r - l).toFixed(2) + "%";
    return r - l;
  };
  for (const e of laneRefs) {
    if (e.classList.contains("bub")) { const x = X(+e.dataset.t, now); e.style.left = x.toFixed(2) + "%"; e.style.display = x < 0 ? "none" : ""; continue; }
    const a = +e.dataset.a, b = e.dataset.b ? +e.dataset.b : null;
    if (!a) { e.style.display = "none"; continue; }
    if (e.classList.contains("idle")) {
      e.style.display = "none";
      if (a) { const to = b || now; put(e, a, to); }
    } else if (e.classList.contains("bar")) {
      const w = put(e, a, b, 0.3), lab = e.dataset.lab;
      e.firstChild.textContent = w > 12 ? lab : "";
    } else put(e, a, b, 0.3);
  }
  const step = tickStep(win), first = Math.ceil((now - win) / step) * step, ticks = [];
  for (let t = first; t < now; t += step) if (X(t, now) < NOW_AT - 8) ticks.push(t);  // keep clear of the "bây giờ" label
  const html = ticks.map(t => `<div class="tk" style="left:${X(t, now).toFixed(2)}%">${hhmm(t)}</div>`).join("") + `<div class="nowl" style="left:${NOW_AT}%">bây giờ</div>`;
  const ax = $("#live-axis");
  if (ax.dataset.sig !== html) { ax.innerHTML = html; ax.dataset.sig = html; }
  $("#live-grid").innerHTML = ticks.map(t => `<div class="gl" style="left:${X(t, now).toFixed(2)}%"></div>`).join("") + `<div class="gnow" style="left:${NOW_AT}%"></div>`;
}
